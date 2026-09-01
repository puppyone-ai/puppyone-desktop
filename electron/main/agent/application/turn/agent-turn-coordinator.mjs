import { redactSecretText } from "../../agent-events.mjs";
import {
  normalizeApprovalDecision,
  normalizeOptionalString,
  normalizeQuestionAnswers,
  normalizeRequiredId,
  normalizeSequence,
  requireMatchingWorkspace,
} from "../agent-input-policy.mjs";
import {
  abandonAgentTurnReferences,
  beginAgentTurnReferences,
  prepareAgentSteerReferenceInput,
  withAgentSteerReferenceTokens,
} from "../agent-reference-policy.mjs";
import { sessionMetadata } from "../../domain/agent-session-model.mjs";

/** Owns user-driven turn and blocking-interaction commands for live sessions. */
export function createAgentTurnCoordinator({
  runtimeSession,
  emit,
  persistSoon,
}) {
  async function startTurn(sender, request, workspaceRoot = null) {
    const session = runtimeSession.requireOwnedSession(sender, request?.sessionId);
    requireMatchingWorkspace(session, workspaceRoot);
    runtimeSession.requireConnectedSession(session);
    if (session.activeTurnId || session.turnStarting || session.interruptingTurnId) {
      throw new Error("An Agent turn is already running or stopping.");
    }
    const model = normalizeOptionalString(request?.model) || session.selectedModel;
    const effort = normalizeOptionalString(request?.effort) || session.selectedEffort;
    const mode = normalizeOptionalString(request?.mode) || session.selectedMode;
    runtimeSession.requireAvailableModel(session, model);
    runtimeSession.requireAvailableEffort(session, model, effort);
    const { references, referenceDisplays, prompt, displayPrompt, promptMentions } = beginAgentTurnReferences(session, request);
    session.turnStarting = true;
    session.activeTurnStartedAtMs = Date.now();
    session.selectedModel = model;
    session.selectedEffort = effort;
    session.selectedMode = mode;
    try {
      const result = await session.adapter.startTurn({
        prompt,
        model,
        ...(effort ? { effort } : {}),
        mode,
        references,
        attachments: references.filter((entry) => entry.kind === "staged-attachment"),
        contextReferences: references.filter((entry) => entry.kind === "workspace-entry"),
      });
      const alreadyTerminal = session.terminalTurnIds.has(result.turnId);
      if (!alreadyTerminal) session.activeTurnId = result.turnId;
      if (!alreadyTerminal && session.lastStartedTurnId !== result.turnId) {
        emit(session, {
          type: "turn.started",
          providerSessionId: session.providerSessionId,
          turnId: result.turnId,
          payload: { status: "running", prompt: displayPrompt, model, effort, mode, referenceDisplays, promptMentions },
        });
      }
      session.pendingPrompt = null;
      session.pendingPromptMentions = [];
      session.pendingReferenceDisplays = [];
      session.turnStarting = false;
      persistSoon(session);
      return { sessionId: session.id, turnId: result.turnId };
    } catch (error) {
      abandonAgentTurnReferences(session);
      session.turnStarting = false;
      session.activeTurnStartedAtMs = null;
      throw new Error(redactSecretText(error instanceof Error ? error.message : String(error)));
    }
  }

  async function steerTurn(sender, request, workspaceRoot = null) {
    const session = runtimeSession.requireOwnedSession(sender, request?.sessionId);
    requireMatchingWorkspace(session, workspaceRoot);
    runtimeSession.requireConnectedSession(session);
    const turnId = normalizeRequiredId(request?.turnId, "Turn id");
    if (session.activeTurnId !== turnId) throw new Error("That Agent turn is no longer running.");
    if (!session.capabilities?.steer || typeof session.adapter.steerTurn !== "function") {
      throw new Error("The active Agent runtime does not support steering a running turn.");
    }
    const deliveryForReference = typeof session.adapter?.referenceMentionDelivery === "function"
      ? (reference) => session.adapter.referenceMentionDelivery(reference)
      : undefined;
    const { message, references } = prepareAgentSteerReferenceInput(request, session.capabilities, deliveryForReference);
    await withAgentSteerReferenceTokens(session, request, () => session.adapter.steerTurn({ turnId, message, references }));
    return { sessionId: session.id, turnId, steered: true };
  }

  async function interruptTurn(sender, request, workspaceRoot = null) {
    const session = runtimeSession.requireOwnedSession(sender, request?.sessionId);
    requireMatchingWorkspace(session, workspaceRoot);
    runtimeSession.requireConnectedSession(session);
    const turnId = normalizeRequiredId(request?.turnId, "Turn id");
    if (session.activeTurnId !== turnId) throw new Error("That Agent turn is no longer running.");
    if (session.interruptingTurnId === turnId) {
      return { sessionId: session.id, turnId, interruptRequested: true };
    }
    session.interruptingTurnId = turnId;
    try {
      await session.adapter.interruptTurn({ turnId });
    } catch (error) {
      session.interruptingTurnId = null;
      runtimeSession.clearInterruptFallback(session);
      throw new Error(redactSecretText(error instanceof Error ? error.message : String(error)));
    }
    // Keep blocking requests actionable until the runtime accepts interruption.
    runtimeSession.failPendingApprovalsClosed(session, "turn-interrupted");
    runtimeSession.failPendingQuestionsClosed(session, "turn-interrupted");
    if (session.activeTurnId === turnId) runtimeSession.scheduleInterruptFallback(session, turnId);
    return { sessionId: session.id, turnId, interruptRequested: true };
  }

  async function resolveQuestion(sender, request, workspaceRoot = null) {
    const session = runtimeSession.requireOwnedSession(sender, request?.sessionId);
    requireMatchingWorkspace(session, workspaceRoot);
    const turnId = normalizeRequiredId(request?.turnId, "Turn id");
    const requestId = normalizeRequiredId(request?.requestId, "Question request id");
    const pending = session.pendingQuestions.get(requestId);
    if (!pending) throw new Error("This question is stale or already resolved.");
    if (pending.turnId !== turnId || pending.runtimeId !== session.runtimeId) {
      throw new Error("Question correlation does not match the active request.");
    }
    if (!session.capabilities?.structuredQuestions || typeof session.adapter?.resolveQuestion !== "function") {
      throw new Error("The active Agent runtime does not support structured questions.");
    }
    const answers = normalizeQuestionAnswers(request?.answers ?? request?.answer, pending.questions);
    const rejected = request?.rejected === true || answers === null;
    await session.adapter.resolveQuestion({ requestId, answers: answers ?? [], rejected, turnId });
    if (session.pendingQuestions.has(requestId)) {
      session.pendingQuestions.delete(requestId);
      emit(session, {
        type: "question.resolved",
        providerSessionId: session.providerSessionId,
        turnId,
        itemId: pending.itemId,
        payload: { requestId, resolution: rejected ? "rejected" : "answered" },
      });
    }
    return { sessionId: session.id, requestId, resolution: rejected ? "rejected" : "answered" };
  }

  function resolveApproval(sender, request, workspaceRoot = null) {
    const session = runtimeSession.requireOwnedSession(sender, request?.sessionId);
    requireMatchingWorkspace(session, workspaceRoot);
    const requestId = normalizeRequiredId(request?.requestId, "Approval request id");
    const pending = session.pendingApprovals.get(requestId);
    if (!pending) throw new Error("This approval is stale or already resolved.");
    const turnId = normalizeRequiredId(request?.turnId, "Turn id");
    if (pending.turnId !== turnId || pending.runtimeId !== session.runtimeId) {
      throw new Error("Approval correlation does not match the active request.");
    }
    const decision = normalizeApprovalDecision(request?.decision);
    const resolution = session.adapter.resolveApproval({
      requestId,
      decision,
      threadId: session.providerSessionId,
      turnId,
    });
    const finalize = () => {
      if (session.pendingApprovals.has(requestId)) {
        session.pendingApprovals.delete(requestId);
        emit(session, {
          type: "approval.resolved",
          providerSessionId: session.providerSessionId,
          turnId,
          itemId: pending.itemId,
          payload: { requestId, decision },
        });
      }
      return { sessionId: session.id, requestId, decision };
    };
    return resolution && typeof resolution.then === "function" ? resolution.then(finalize) : finalize();
  }

  function replay(sender, request, workspaceRoot = null) {
    const session = runtimeSession.requireOwnedSession(sender, request?.sessionId);
    requireMatchingWorkspace(session, workspaceRoot);
    const afterSequence = normalizeSequence(request?.afterSequence);
    const firstSequence = session.events[0]?.sequence ?? session.sequence + 1;
    return {
      session: sessionMetadata(session),
      account: session.account,
      models: session.models,
      capabilities: session.capabilities,
      modes: session.modes,
      commands: session.commands,
      runtime: session.runtime,
      events: session.events.filter((event) => event.sequence > afterSequence),
      partial: afterSequence > 0 && afterSequence < firstSequence - 1,
      firstAvailableSequence: firstSequence,
      lastSequence: session.sequence,
    };
  }

  function getReferenceInputCapabilities(sender, sessionId, workspaceRoot = null) {
    const session = runtimeSession.requireOwnedSession(sender, normalizeRequiredId(sessionId, "Agent session id"));
    requireMatchingWorkspace(session, workspaceRoot);
    return session.capabilities?.referenceInputs ? { ...session.capabilities.referenceInputs } : null;
  }

  return {
    getReferenceInputCapabilities,
    interruptTurn,
    replay,
    resolveApproval,
    resolveQuestion,
    startTurn,
    steerTurn,
  };
}
