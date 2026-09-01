import { redactSecretText } from "../../agent-events.mjs";
import {
  assertAuthenticated,
  normalizeRuntimeId,
} from "../agent-input-policy.mjs";
import {
  revokeActiveAgentReferences,
  scrubPrivateReferencePaths,
} from "../agent-reference-policy.mjs";
import {
  applyInspection,
  rememberTerminalTurn,
  requireConnectedSession,
} from "../../domain/agent-session-model.mjs";
import { assertAgentRuntimeInspection } from "../../runtime/agent-runtime-port.mjs";

const INTERRUPT_CONFIRMATION_TIMEOUT_MS = 5_000;
const MAX_TURN_DURATION_MS = 30 * 24 * 60 * 60 * 1_000;

/**
 * Owns the lifecycle of one live Harness adapter and projects its callbacks
 * into the provider-neutral session model. It does not decide which persisted
 * session to open or which user command to execute.
 */
export function createAgentSessionRuntime({
  runtimeRegistry,
  runtimeResolutionCoordinator,
  processSupervisor,
  sessionStore,
  cache,
  attachmentStore,
  logger,
  emit,
  persistNow,
  sendSessionExit,
}) {
  const runRuntimeStart = (session, operation, start) => processSupervisor.runStart({
    label: `${session.runtimeId}:${operation}`,
  }, start);

  async function resolveRuntimeForOperation(value, workspaceRoot, operation) {
    const requested = normalizeRuntimeId(value);
    if (typeof value === "string" && value.trim() && !requested) throw new Error("Agent runtime id is invalid.");
    if (!requested) throw new Error("Choose an Agent before starting an Agent session.");
    return runtimeResolutionCoordinator.resolveForOperation({
      runtimeId: requested,
      workspaceRoot,
      operation,
    });
  }

  function createAdapterForSession(session, internalReadiness) {
    return runtimeRegistry.createAdapter(session.runtimeId, {
      readiness: { ...internalReadiness, workspaceRoot: session.workspaceRoot },
      workspaceRoot: session.workspaceRoot,
      onEvent: (event) => handleAdapterEvent(session, event),
      onExit: (info) => handleAdapterExit(session, info),
    });
  }

  async function bootstrapNativeSession(session, selected, { kind, operation, threadId = null }) {
    const selection = {
      model: session.selectedModel,
      ...(session.selectedEffort ? { effort: session.selectedEffort } : {}),
      ...(session.selectedMode ? { mode: session.selectedMode } : {}),
    };
    let inspection;
    let providerSession;
    if (typeof session.adapter.bootstrapSession === "function") {
      const result = await runRuntimeStart(session, `bootstrap-${operation}`, () => (
        session.adapter.bootstrapSession({ kind, threadId, ...selection })
      ));
      inspection = assertAgentRuntimeInspection(session.adapter, result?.inspection, session.runtimeId);
      providerSession = result?.providerSession;
    } else {
      const inspected = await runRuntimeStart(session, "inspect", () => session.adapter.inspect());
      inspection = assertAgentRuntimeInspection(session.adapter, inspected, session.runtimeId);
    }
    assertAuthenticated(inspection.account, selected.descriptor.displayName);
    applyInspection(session, inspection);
    requireAvailableModel(session, session.selectedModel);
    requireAvailableEffort(session, session.selectedModel, session.selectedEffort);
    if (!providerSession) {
      providerSession = kind === "resume"
        ? await runRuntimeStart(session, operation, () => session.adapter.resumeSession({
          threadId,
          ...selection,
        }))
        : await runRuntimeStart(session, operation, () => session.adapter.createSession(selection));
    }
    return { inspection, providerSession };
  }

  function handleAdapterEvent(session, adapterEvent) {
    if (!sessionStore.isCurrent(session) || session.closing) return;
    const event = { ...adapterEvent };
    event.payload = scrubPrivateReferencePaths(event.payload, session.privateReferencePaths);
    if (event.type === "session.started" || event.type === "session.resumed") {
      if (session.lifecycleEventSeen) return;
      session.lifecycleEventSeen = true;
      if (event.providerSessionId) session.providerSessionId = event.providerSessionId;
      if (typeof event.payload?.title === "string") session.title = event.payload.title;
    }
    if (event.type === "session.updated" && typeof event.payload?.title === "string") {
      session.title = event.payload.title.slice(0, 200);
    }
    if (event.type === "turn.started") {
      session.activeTurnId = event.turnId;
      if (!Number.isFinite(session.activeTurnStartedAtMs)) session.activeTurnStartedAtMs = Date.now();
      session.lastStartedTurnId = event.turnId;
      session.terminalState = "running";
      if (session.pendingPrompt || session.pendingReferenceDisplays.length > 0) {
        event.payload = {
          ...(event.payload || {}),
          prompt: session.pendingPrompt,
          promptMentions: session.pendingPromptMentions,
          model: session.selectedModel,
          effort: session.selectedEffort,
          referenceDisplays: session.pendingReferenceDisplays,
        };
      }
    }
    if (["turn.completed", "turn.failed", "turn.interrupted"].includes(event.type)) {
      const activeTurnEnded = session.turnStarting || !event.turnId || session.activeTurnId === event.turnId;
      event.payload = withTurnDuration(event.payload, activeTurnEnded ? session.activeTurnStartedAtMs : null);
      rememberTerminalTurn(session, event.turnId);
      failPendingApprovalsForTurn(session, event.turnId, "turn-ended");
      failPendingQuestionsForTurn(session, event.turnId, "turn-ended");
      if (activeTurnEnded) {
        session.activeTurnId = null;
        session.activeTurnStartedAtMs = null;
        session.interruptingTurnId = null;
        session.terminalState = event.type.slice("turn.".length);
        clearInterruptFallback(session);
        session.privateReferencePaths.clear();
        void revokeActiveAgentReferences(session, attachmentStore);
      }
    }
    if (event.type === "approval.requested") {
      const requestId = event.payload?.requestId;
      if (typeof requestId !== "string" || session.pendingApprovals.has(requestId)) return;
      session.pendingApprovals.set(requestId, {
        requestId,
        turnId: event.turnId,
        itemId: event.itemId,
        runtimeId: session.runtimeId,
      });
    }
    if (event.type === "approval.resolved") {
      const requestId = event.payload?.requestId;
      if (!session.pendingApprovals.delete(requestId)) return;
    }
    if (event.type === "question.requested") {
      const requestId = event.payload?.requestId;
      if (typeof requestId !== "string" || !event.turnId || session.pendingQuestions.has(requestId)) return;
      session.pendingQuestions.set(requestId, {
        requestId,
        turnId: event.turnId,
        itemId: event.itemId,
        runtimeId: session.runtimeId,
        questions: Array.isArray(event.payload?.questions) ? event.payload.questions : [],
      });
    }
    if (event.type === "question.resolved") {
      const requestId = event.payload?.requestId;
      if (!session.pendingQuestions.delete(requestId)) return;
    }
    emit(session, event);
  }

  function handleAdapterExit(session, info) {
    if (!sessionStore.isCurrent(session) || session.closing || session.providerExited || info?.expected || !session.providerSessionId) return;
    runtimeResolutionCoordinator.recordOperationFailure({
      runtimeId: session.runtimeId,
      workspaceRoot: session.workspaceRoot,
    });
    retireProviderSession(session, {
      turnMessage: `${session.runtime?.displayName || "Agent runtime"} exited before the turn completed.`,
      providerMessage: `${session.runtime?.displayName || "Agent runtime"} exited. Files already changed on disk were not reverted.`,
      diagnostic: info?.diagnostics || info?.error || "",
    });
  }

  function failPendingApprovalsClosed(session, reason) {
    if (session.pendingApprovals.size === 0) return;
    for (const pending of Array.from(session.pendingApprovals.values())) {
      session.pendingApprovals.delete(pending.requestId);
      emit(session, {
        type: "approval.resolved",
        providerSessionId: session.providerSessionId,
        turnId: pending.turnId,
        itemId: pending.itemId,
        payload: { requestId: pending.requestId, decision: "cancel", reason },
      });
    }
  }

  function failPendingApprovalsForTurn(session, turnId, reason) {
    if (!turnId || session.pendingApprovals.size === 0) return;
    for (const pending of Array.from(session.pendingApprovals.values())) {
      if (pending.turnId !== turnId) continue;
      session.pendingApprovals.delete(pending.requestId);
      emit(session, {
        type: "approval.resolved",
        providerSessionId: session.providerSessionId,
        turnId: pending.turnId,
        itemId: pending.itemId,
        payload: { requestId: pending.requestId, decision: "cancel", reason },
      });
    }
  }

  function failPendingQuestionsClosed(session, reason) {
    if (session.pendingQuestions.size === 0) return;
    for (const pending of Array.from(session.pendingQuestions.values())) {
      session.pendingQuestions.delete(pending.requestId);
      emit(session, {
        type: "question.resolved",
        providerSessionId: session.providerSessionId,
        turnId: pending.turnId,
        itemId: pending.itemId,
        payload: { requestId: pending.requestId, resolution: "rejected", reason },
      });
    }
  }

  function failPendingQuestionsForTurn(session, turnId, reason) {
    if (!turnId || session.pendingQuestions.size === 0) return;
    for (const pending of Array.from(session.pendingQuestions.values())) {
      if (pending.turnId !== turnId) continue;
      session.pendingQuestions.delete(pending.requestId);
      emit(session, {
        type: "question.resolved",
        providerSessionId: session.providerSessionId,
        turnId: pending.turnId,
        itemId: pending.itemId,
        payload: { requestId: pending.requestId, resolution: "rejected", reason },
      });
    }
  }

  function scheduleInterruptFallback(session, turnId) {
    clearInterruptFallback(session);
    session.interruptFallbackTimer = setTimeout(() => {
      session.interruptFallbackTimer = null;
      if (!sessionStore.isCurrent(session) || session.closing || session.activeTurnId !== turnId) return;
      const runtimeName = session.runtime?.displayName || "Agent runtime";
      const forcedExit = typeof session.adapter?.forceTerminate === "function"
        ? session.adapter.forceTerminate(`${runtimeName} did not confirm the interrupt in time.`)
        : session.adapter?.dispose?.(`${runtimeName} did not confirm the interrupt in time.`);
      void Promise.resolve(forcedExit).catch((error) => {
        logger.warn?.("Unable to force-stop unresponsive Agent runtime:", redactSecretText(error?.message || String(error)));
      });
      retireProviderSession(session, {
        turnMessage: `${runtimeName} did not confirm the interrupt, so PuppyOne stopped the runtime process. Files already changed were not reverted.`,
        providerMessage: `${runtimeName} was stopped because it did not confirm the interrupt. Refresh to resume the saved session.`,
        diagnostic: "Interrupt confirmation timed out.",
      });
    }, INTERRUPT_CONFIRMATION_TIMEOUT_MS);
    session.interruptFallbackTimer.unref?.();
  }

  function clearInterruptFallback(session) {
    if (!session.interruptFallbackTimer) return;
    clearTimeout(session.interruptFallbackTimer);
    session.interruptFallbackTimer = null;
  }

  function retireProviderSession(session, { turnMessage, providerMessage, diagnostic }) {
    if (!sessionStore.isCurrent(session) || session.closing || session.providerExited) return;
    clearInterruptFallback(session);
    failPendingApprovalsClosed(session, "provider-exited");
    failPendingQuestionsClosed(session, "provider-exited");
    const activeTurnId = session.activeTurnId;
    session.activeTurnId = null;
    session.interruptingTurnId = null;
    void revokeActiveAgentReferences(session, attachmentStore);
    if (activeTurnId) {
      rememberTerminalTurn(session, activeTurnId);
      emit(session, {
        type: "turn.failed",
        providerSessionId: session.providerSessionId,
        turnId: activeTurnId,
        payload: withTurnDuration({ status: "failed", message: turnMessage }, session.activeTurnStartedAtMs),
      });
    }
    session.activeTurnStartedAtMs = null;
    session.terminalState = "provider-exited";
    emit(session, {
      type: "provider.error",
      providerSessionId: session.providerSessionId,
      payload: {
        message: providerMessage,
        diagnostic: redactSecretText(diagnostic || ""),
        recoverable: true,
      },
    });
    sendSessionExit(session, "provider-exited");
    clearTimeout(session.persistTimer);
    session.persistTimer = null;
    void persistNow(session);
    void Promise.resolve(session.adapter?.dispose()).catch((error) => {
      logger.warn?.("Unable to release exited Agent adapter:", redactSecretText(error?.message || String(error)));
    });
    session.adapter = null;
    session.providerExited = true;
  }

  async function closeSessionRecord(session, { persist, removePersistence = false }) {
    if (session.closing) return;
    session.closing = true;
    clearTimeout(session.persistTimer);
    session.persistTimer = null;
    clearInterruptFallback(session);
    failPendingApprovalsClosed(session, "session-closed");
    failPendingQuestionsClosed(session, "session-closed");
    try {
      await session.adapter?.dispose();
    } finally {
      await revokeActiveAgentReferences(session, attachmentStore);
      if (sessionStore.isCurrent(session)) {
        session.closing = false;
        emit(session, {
          type: "session.closed",
          providerSessionId: session.providerSessionId,
          payload: { terminalState: session.terminalState },
        }, { deliver: !session.sender.isDestroyed?.() });
        session.closing = true;
        sessionStore.remove(session);
      }
      sendSessionExit(session, "closed");
      if (removePersistence) await cache.remove(session.id);
      else if (persist) await persistNow(session);
    }
  }

  function requireOwnedSession(sender, id) {
    return sessionStore.requireOwned(sender, id);
  }

  function requireAvailableModel(session, model) {
    if (!model) throw new Error("Choose a connected model provider and model before sending a message.");
    if (!session.models.some((candidate) => candidate.model === model)) {
      throw new Error("The selected model is no longer available from a connected provider. Refresh Agent providers and choose again.");
    }
    return model;
  }

  function requireAvailableEffort(session, model, effort) {
    const selected = session.models.find((candidate) => candidate.model === model);
    const available = selected?.variants ?? [];
    if (!effort && available.length === 0) return null;
    if (!effort || !available.includes(effort)) {
      throw new Error("The selected reasoning effort is no longer available for this model. Refresh Agent models and choose again.");
    }
    return effort;
  }

  return {
    bootstrapNativeSession,
    clearInterruptFallback,
    closeSessionRecord,
    createAdapterForSession,
    failPendingApprovalsClosed,
    failPendingQuestionsClosed,
    requireAvailableEffort,
    requireAvailableModel,
    requireConnectedSession,
    requireOwnedSession,
    resolveRuntimeForOperation,
    scheduleInterruptFallback,
  };
}

function withTurnDuration(payload, startedAtMs) {
  const candidate = Number(payload?.durationMs);
  const durationMs = Number.isFinite(candidate) && candidate >= 0
    ? candidate
    : Number.isFinite(startedAtMs)
      ? Date.now() - startedAtMs
      : null;
  if (!Number.isFinite(durationMs) || durationMs < 0) return { ...(payload || {}) };
  return {
    ...(payload || {}),
    durationMs: Math.min(MAX_TURN_DURATION_MS, Math.round(durationMs)),
  };
}
