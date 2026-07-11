import { randomUUID } from "node:crypto";
import { redactSecretText } from "./agent-events.mjs";
import {
  assertAuthenticated,
  assertReady,
  normalizeApprovalDecision,
  normalizeAuthorizedReferences,
  normalizeOptionalId,
  normalizeOptionalString,
  normalizePrompt,
  normalizeQuestionAnswers,
  normalizeRequiredId,
  normalizeRuntimeId,
  normalizeSequence,
  requireMatchingWorkspace,
  requireSenderId,
  requireWorkspaceRoot,
} from "./application/agent-input-policy.mjs";
import { createAgentRuntimeCatalog } from "./application/agent-runtime-catalog.mjs";
import { createAgentEventJournal } from "./application/agent-event-journal.mjs";
import { AgentSessionStore } from "./application/agent-session-store.mjs";
import {
  applyInspection,
  applyProviderSession,
  createAgentSessionRecord as createSessionRecord,
  persistedRecordFromSession,
  publicSessionRecord,
  rememberTerminalTurn,
  requireConnectedSession,
  sessionMetadata,
  sessionSnapshot,
} from "./domain/agent-session-model.mjs";
import { resolvePersistedRuntimeId } from "./migrations/legacy-session-format.mjs";
import { assertAgentRuntimeInspection } from "./runtime/agent-runtime-port.mjs";

const INTERRUPT_CONFIRMATION_TIMEOUT_MS = 5_000;

export function createAgentService({
  runtimeRegistry,
  persistence,
  logger = console,
}) {
  if (!runtimeRegistry || typeof runtimeRegistry.createAdapter !== "function") {
    throw new TypeError("AgentService requires a provider-neutral runtime registry.");
  }
  const sessionStore = new AgentSessionStore({ onOwnerDestroyed: closeSessionsForWindow });
  const sessionCreations = new Set();
  const runtimeCatalog = createAgentRuntimeCatalog({ runtimeRegistry });
  const { emit, persistNow, persistSoon, sendSessionExit } = createAgentEventJournal({ persistence, logger });

  const discoverProviders = (_sender, request = {}, workspaceRoot = null) => runtimeCatalog.discover(request, workspaceRoot);
  const listModels = (_sender, request = {}, workspaceRoot = null) => runtimeCatalog.listModels(request, workspaceRoot);
  const readAccount = (_sender, request = {}, workspaceRoot = null) => runtimeCatalog.readAccount(request, workspaceRoot);

  async function createSession(sender, request, workspaceRoot) {
    const ownerId = requireSenderId(sender);
    requireWorkspaceRoot(workspaceRoot);
    discardRetiredSessions(ownerId, workspaceRoot);
    if (findOwnedSession(ownerId, workspaceRoot, { connectedOnly: true })) {
      throw new Error("This workspace already has an active Agent session.");
    }
    const creationKey = `${ownerId}\0${workspaceRoot}`;
    if (sessionCreations.has(creationKey)) throw new Error("An Agent session is already starting for this workspace.");
    sessionCreations.add(creationKey);
    try {
      const catalog = await runtimeRegistry.discover({ refresh: false });
      const selected = selectRequestedRuntime(catalog, request?.runtimeId);
      assertReady(selected?.readiness, selected?.descriptor?.displayName);
      const session = createSessionRecord({
        id: randomUUID(),
        ownerId,
        sender,
        workspaceRoot,
        runtimeId: selected.descriptor.id,
        runtime: selected.descriptor,
        model: normalizeOptionalString(request?.model),
        mode: normalizeOptionalString(request?.mode),
      });
      sessionStore.add(session);
      try {
        session.adapter = createAdapterForSession(session, selected.readiness);
        const inspection = assertAgentRuntimeInspection(session.adapter, await session.adapter.inspect(), session.runtimeId);
        assertAuthenticated(inspection.account);
        applyInspection(session, inspection);
        requireAvailableModel(session, session.selectedModel);
        const providerSession = await session.adapter.createSession({
          model: session.selectedModel,
          mode: session.selectedMode,
        });
        applyProviderSession(session, providerSession);
        if (!session.lifecycleEventSeen) {
          emit(session, {
            type: "session.started",
            providerSessionId: session.providerSessionId,
            payload: sessionMetadata(session),
          });
        }
        persistSoon(session);
        return sessionSnapshot(session);
      } catch (error) {
        await closeSessionRecord(session, { persist: false });
        throw new Error(redactSecretText(error instanceof Error ? error.message : String(error)));
      }
    } finally {
      sessionCreations.delete(creationKey);
    }
  }

  async function resumeSession(sender, request, workspaceRoot) {
    const ownerId = requireSenderId(sender);
    requireWorkspaceRoot(workspaceRoot);
    const connected = findOwnedSession(ownerId, workspaceRoot, { connectedOnly: true });
    const requestedSessionId = normalizeOptionalId(request?.sessionId);
    if (connected && (!requestedSessionId || connected.id === requestedSessionId)) return sessionSnapshot(connected);
    if (connected) await closeSessionRecord(connected, { persist: true });
    const creationKey = `${ownerId}\0${workspaceRoot}`;
    if (sessionCreations.has(creationKey)) throw new Error("An Agent session is already starting for this workspace.");
    sessionCreations.add(creationKey);
    try {
      const retired = takeRetiredSession(ownerId, workspaceRoot, requestedSessionId);
      const persisted = retired
        ? persistedRecordFromSession(retired)
        : requestedSessionId
          ? await persistence.findById(requestedSessionId, workspaceRoot)
          : await persistence.findLatest(workspaceRoot, normalizeRuntimeId(request?.runtimeId));
      if (!persisted) return null;
      const existing = sessionStore.get(persisted.sessionId);
      if (existing) return sessionSnapshot(requireOwnedSession(sender, existing.id));
      const runtimeId = resolvePersistedRuntimeId(persisted, normalizeRuntimeId(request?.runtimeId));
      const catalog = await runtimeRegistry.discover({ refresh: false });
      const selected = runtimeRegistry.select(catalog, runtimeId);
      if (!selected || selected.descriptor.id !== runtimeId) throw new Error(`Agent runtime ${runtimeId} is not registered.`);
      assertReady(selected.readiness, selected.descriptor.displayName);
      const session = createSessionRecord({
        id: persisted.sessionId,
        ownerId,
        sender,
        workspaceRoot,
        runtimeId,
        runtime: selected.descriptor,
        model: normalizeOptionalString(persisted.selectedModel),
        mode: normalizeOptionalString(persisted.selectedMode),
        events: persisted.events,
        sequence: persisted.lastSequence,
        createdAt: persisted.createdAt,
        title: persisted.title,
      });
      session.providerSessionId = persisted.providerSessionId;
      session.terminalState = persisted.terminalState || "idle";
      sessionStore.add(session);
      try {
        session.adapter = createAdapterForSession(session, selected.readiness);
        const inspection = assertAgentRuntimeInspection(session.adapter, await session.adapter.inspect(), session.runtimeId);
        assertAuthenticated(inspection.account);
        applyInspection(session, inspection);
        const resumeRequest = {
          threadId: persisted.providerSessionId,
          model: session.selectedModel,
        };
        if (session.selectedMode) resumeRequest.mode = session.selectedMode;
        const providerSession = await session.adapter.resumeSession(resumeRequest);
        applyProviderSession(session, providerSession);
        if (session.events.length === 0) {
          const historicalEvents = typeof session.adapter.readHistory === "function"
            ? await session.adapter.readHistory()
            : [];
          for (const historicalEvent of historicalEvents) emit(session, historicalEvent, { deliver: false });
        }
        if (!session.lifecycleEventSeen) {
          emit(session, {
            type: "session.resumed",
            providerSessionId: session.providerSessionId,
            payload: sessionMetadata(session),
          });
        }
        persistSoon(session);
        return sessionSnapshot(session);
      } catch (error) {
        await closeSessionRecord(session, { persist: false });
        throw new Error(`Unable to resume Agent session: ${redactSecretText(error instanceof Error ? error.message : String(error))}`);
      }
    } finally {
      sessionCreations.delete(creationKey);
    }
  }

  async function startTurn(sender, request, workspaceRoot = null) {
    const session = requireOwnedSession(sender, request?.sessionId);
    requireMatchingWorkspace(session, workspaceRoot);
    requireConnectedSession(session);
    if (session.activeTurnId || session.turnStarting || session.interruptingTurnId) {
      throw new Error("An Agent turn is already running or stopping.");
    }
    const prompt = normalizePrompt(request?.prompt);
    const model = normalizeOptionalString(request?.model) || session.selectedModel;
    const mode = normalizeOptionalString(request?.mode) || session.selectedMode;
    requireAvailableModel(session, model);
    session.pendingPrompt = prompt;
    session.turnStarting = true;
    session.selectedModel = model;
    session.selectedMode = mode;
    try {
      const result = await session.adapter.startTurn({
        prompt,
        model,
        mode,
        attachments: normalizeAuthorizedReferences(request?.attachments),
        contextReferences: normalizeAuthorizedReferences(request?.contextReferences),
      });
      const alreadyTerminal = session.terminalTurnIds.has(result.turnId);
      if (!alreadyTerminal) session.activeTurnId = result.turnId;
      if (!alreadyTerminal && session.lastStartedTurnId !== result.turnId) {
        emit(session, {
          type: "turn.started",
          providerSessionId: session.providerSessionId,
          turnId: result.turnId,
          payload: { status: "running", prompt, model, mode },
        });
      }
      session.pendingPrompt = null;
      session.turnStarting = false;
      persistSoon(session);
      return { sessionId: session.id, turnId: result.turnId };
    } catch (error) {
      session.pendingPrompt = null;
      session.turnStarting = false;
      throw new Error(redactSecretText(error instanceof Error ? error.message : String(error)));
    }
  }

  async function steerTurn(sender, request, workspaceRoot = null) {
    const session = requireOwnedSession(sender, request?.sessionId);
    requireMatchingWorkspace(session, workspaceRoot);
    requireConnectedSession(session);
    const turnId = normalizeRequiredId(request?.turnId, "Turn id");
    if (session.activeTurnId !== turnId) throw new Error("That Agent turn is no longer running.");
    if (!session.capabilities?.steer || typeof session.adapter.steerTurn !== "function") {
      throw new Error("The active Agent runtime does not support steering a running turn.");
    }
    const message = normalizePrompt(request?.message);
    await session.adapter.steerTurn({ turnId, message });
    return { sessionId: session.id, turnId, steered: true };
  }

  async function interruptTurn(sender, request, workspaceRoot = null) {
    const session = requireOwnedSession(sender, request?.sessionId);
    requireMatchingWorkspace(session, workspaceRoot);
    requireConnectedSession(session);
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
      clearInterruptFallback(session);
      throw new Error(redactSecretText(error instanceof Error ? error.message : String(error)));
    }
    // Do not discard an actionable approval until the runtime has accepted the
    // interrupt request. If the request itself fails, the live turn may still
    // be blocked on that approval and the user must retain a way to resolve it.
    failPendingApprovalsClosed(session, "turn-interrupted");
    failPendingQuestionsClosed(session, "turn-interrupted");
    if (session.activeTurnId === turnId) scheduleInterruptFallback(session, turnId);
    return { sessionId: session.id, turnId, interruptRequested: true };
  }

  async function resolveQuestion(sender, request, workspaceRoot = null) {
    const session = requireOwnedSession(sender, request?.sessionId);
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
    const session = requireOwnedSession(sender, request?.sessionId);
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
    return resolution && typeof resolution.then === "function"
      ? resolution.then(finalize)
      : finalize();
  }

  function replay(sender, request, workspaceRoot = null) {
    const session = requireOwnedSession(sender, request?.sessionId);
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

  async function listSessions(_sender, request, workspaceRoot) {
    requireWorkspaceRoot(workspaceRoot);
    const runtimeId = normalizeRuntimeId(request?.runtimeId);
    const records = await persistence.list(workspaceRoot, { runtimeId, includeArchived: Boolean(request?.includeArchived) });
    return records.map((record) => publicSessionRecord({
      ...record,
      runtimeId: resolvePersistedRuntimeId(record, runtimeId),
    }));
  }

  async function forkSession(sender, request, workspaceRoot = null) {
    const source = requireOwnedSession(sender, request?.sessionId);
    requireMatchingWorkspace(source, workspaceRoot);
    requireConnectedSession(source);
    if (source.activeTurnId) throw new Error("Stop the active turn before forking this session.");
    if (!source.capabilities?.fork || typeof source.adapter?.forkSession !== "function") {
      throw new Error("The active Agent runtime does not support session forking.");
    }
    const forked = await source.adapter.forkSession({ messageId: normalizeOptionalId(request?.messageId) });
    await persistNow(source);
    await closeSessionRecord(source, { persist: true });
    const catalog = await runtimeRegistry.discover({ refresh: false });
    const selected = runtimeRegistry.select(catalog, source.runtimeId);
    assertReady(selected?.readiness, selected?.descriptor?.displayName);
    const session = createSessionRecord({
      id: randomUUID(),
      ownerId: source.ownerId,
      sender,
      workspaceRoot: source.workspaceRoot,
      runtimeId: source.runtimeId,
      runtime: source.runtime,
      model: source.selectedModel,
      mode: source.selectedMode,
      title: `${source.title} (fork)`,
    });
    sessionStore.add(session);
    try {
      session.adapter = createAdapterForSession(session, selected.readiness);
      const inspection = assertAgentRuntimeInspection(session.adapter, await session.adapter.inspect(), session.runtimeId);
      applyInspection(session, inspection);
      const resumed = await session.adapter.resumeSession({
        threadId: forked.providerSessionId,
        model: session.selectedModel,
        mode: session.selectedMode,
      });
      applyProviderSession(session, resumed);
      const historicalEvents = typeof session.adapter.readHistory === "function" ? await session.adapter.readHistory() : [];
      for (const historicalEvent of historicalEvents) emit(session, historicalEvent, { deliver: false });
      emit(session, {
        type: "session.resumed",
        providerSessionId: session.providerSessionId,
        payload: { ...sessionMetadata(session), forkedFrom: source.id },
      });
      await persistNow(session);
      return sessionSnapshot(session);
    } catch (error) {
      await closeSessionRecord(session, { persist: false });
      throw error;
    }
  }

  async function archiveSession(sender, request, workspaceRoot) {
    requireWorkspaceRoot(workspaceRoot);
    const sessionId = normalizeRequiredId(request?.sessionId, "Agent session id");
    const active = sessionStore.get(sessionId);
    if (active) {
      requireOwnedSession(sender, sessionId);
      requireMatchingWorkspace(active, workspaceRoot);
      if (active.activeTurnId) throw new Error("Stop the active turn before archiving this session.");
      if (request?.archiveNative && typeof active.adapter?.archiveNativeSession === "function") {
        await active.adapter.archiveNativeSession({ threadId: active.providerSessionId });
      }
      await closeSessionRecord(active, { persist: true });
    } else {
      await requirePersistedSessionInWorkspace(sessionId, workspaceRoot);
    }
    await persistence.archive(sessionId, new Date().toISOString());
    return { sessionId, archived: true };
  }

  async function deleteSession(sender, request, workspaceRoot) {
    requireWorkspaceRoot(workspaceRoot);
    const sessionId = normalizeRequiredId(request?.sessionId, "Agent session id");
    const active = sessionStore.get(sessionId);
    if (active) {
      requireOwnedSession(sender, sessionId);
      requireMatchingWorkspace(active, workspaceRoot);
      if (active.activeTurnId) throw new Error("Stop the active turn before deleting this session.");
      if (request?.deleteNative && typeof active.adapter?.deleteNativeSession === "function") {
        await active.adapter.deleteNativeSession({ threadId: active.providerSessionId });
      }
      await closeSessionRecord(active, { persist: false });
    } else {
      await requirePersistedSessionInWorkspace(sessionId, workspaceRoot);
    }
    await persistence.remove(sessionId);
    return { sessionId, deleted: true, nativeDeleted: Boolean(request?.deleteNative && active) };
  }

  async function compactSession(sender, request, workspaceRoot = null) {
    const session = requireOwnedSession(sender, request?.sessionId);
    requireMatchingWorkspace(session, workspaceRoot);
    requireConnectedSession(session);
    if (session.activeTurnId) throw new Error("Stop the active turn before compacting this session.");
    if (!session.capabilities?.compaction || typeof session.adapter?.compactSession !== "function") {
      throw new Error("The active Agent runtime does not support session compaction.");
    }
    await session.adapter.compactSession();
    return { sessionId: session.id, compacted: true };
  }

  async function requirePersistedSessionInWorkspace(sessionId, workspaceRoot) {
    const persisted = await persistence.findById(sessionId, workspaceRoot);
    if (!persisted) throw new Error("Agent session was not found in the assigned workspace.");
    return persisted;
  }

  async function closeSession(sender, request, workspaceRoot = null) {
    const session = requireOwnedSession(sender, request?.sessionId);
    requireMatchingWorkspace(session, workspaceRoot);
    const removePersistence = Boolean(request?.removePersistence);
    await closeSessionRecord(session, { persist: !removePersistence, removePersistence });
    return { sessionId: session.id, closed: true };
  }

  function closeSessionsForWindow(webContentsId) {
    return Promise.all(sessionStore.values()
      .filter((session) => session.ownerId === webContentsId)
      .map((session) => closeSessionRecord(session, { persist: true })));
  }

  async function closeAll() {
    await Promise.all(sessionStore.values()
      .map((session) => closeSessionRecord(session, { persist: true })));
    await runtimeRegistry.dispose?.();
  }

  function getSessionCount() {
    return sessionStore.activeCount();
  }

  function getRetainedSessionCount() {
    return sessionStore.size;
  }

  function hasRuntimeResources() {
    return runtimeRegistry.hasActiveResources?.() === true;
  }

  function selectRequestedRuntime(catalog, value) {
    const requested = normalizeRuntimeId(value);
    if (typeof value === "string" && value.trim() && !requested) throw new Error("Agent runtime id is invalid.");
    if (requested && !catalog.some((entry) => entry.descriptor.id === requested)) {
      throw new Error(`Agent runtime ${requested} is not registered.`);
    }
    return runtimeRegistry.select(catalog, requested);
  }

  function createAdapterForSession(session, internalReadiness) {
    return createAdapter({
      runtimeId: session.runtimeId,
      internalReadiness,
      workspaceRoot: session.workspaceRoot,
      onEvent: (event) => handleAdapterEvent(session, event),
      onExit: (info) => handleAdapterExit(session, info),
    });
  }

  function createAdapter({ runtimeId, internalReadiness, workspaceRoot, onEvent, onExit }) {
    return runtimeRegistry.createAdapter(runtimeId, {
      readiness: { ...internalReadiness, workspaceRoot },
      workspaceRoot,
      onEvent,
      onExit,
    });
  }

  function handleAdapterEvent(session, adapterEvent) {
    if (!sessionStore.isCurrent(session) || session.closing) return;
    const event = { ...adapterEvent };
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
      session.lastStartedTurnId = event.turnId;
      session.terminalState = "running";
      if (session.pendingPrompt) {
        event.payload = { ...(event.payload || {}), prompt: session.pendingPrompt, model: session.selectedModel };
      }
    }
    if (["turn.completed", "turn.failed", "turn.interrupted"].includes(event.type)) {
      rememberTerminalTurn(session, event.turnId);
      failPendingApprovalsForTurn(session, event.turnId, "turn-ended");
      failPendingQuestionsForTurn(session, event.turnId, "turn-ended");
      if (session.turnStarting || !event.turnId || session.activeTurnId === event.turnId) {
        session.activeTurnId = null;
        session.interruptingTurnId = null;
        session.terminalState = event.type.slice("turn.".length);
        clearInterruptFallback(session);
      }
    }
    if (event.type === "approval.requested") {
      const requestId = event.payload?.requestId;
      if (typeof requestId !== "string") return;
      if (session.pendingApprovals.has(requestId)) return;
      session.pendingApprovals.set(requestId, {
        requestId,
        turnId: event.turnId,
        itemId: event.itemId,
        runtimeId: session.runtimeId,
      });
    }
    if (event.type === "approval.resolved") {
      const requestId = event.payload?.requestId;
      // Avoid re-emitting a resolution already surfaced by
      // failPendingApprovalsClosed (interrupt/close) for the same request.
      if (!session.pendingApprovals.delete(requestId)) return;
    }
    if (event.type === "question.requested") {
      const requestId = event.payload?.requestId;
      if (typeof requestId !== "string" || !event.turnId) return;
      if (session.pendingQuestions.has(requestId)) return;
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
      if (!sessionStore.isCurrent(session) || session.closing) return;
      if (session.activeTurnId !== turnId) return;
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
    if (activeTurnId) {
      rememberTerminalTurn(session, activeTurnId);
      emit(session, {
        type: "turn.failed",
        providerSessionId: session.providerSessionId,
        turnId: activeTurnId,
        payload: { status: "failed", message: turnMessage },
      });
    }
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
      if (removePersistence) await persistence.remove(session.id);
      else if (persist) await persistNow(session);
    }
  }

  function takeRetiredSession(ownerId, workspaceRoot, requestedSessionId = null) {
    return sessionStore.takeRetired(ownerId, workspaceRoot, requestedSessionId);
  }

  function findOwnedSession(ownerId, workspaceRoot, { connectedOnly = false } = {}) {
    return sessionStore.findOwned(ownerId, workspaceRoot, { connectedOnly });
  }

  function discardRetiredSessions(ownerId, workspaceRoot) {
    sessionStore.discardRetired(ownerId, workspaceRoot);
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

  return {
    discoverProviders,
    listModels,
    readAccount,
    createSession,
    resumeSession,
    startTurn,
    steerTurn,
    interruptTurn,
    resolveApproval,
    resolveQuestion,
    replay,
    listSessions,
    forkSession,
    archiveSession,
    deleteSession,
    compactSession,
    closeSession,
    closeSessionsForWindow,
    closeAll,
    getSessionCount,
    getRetainedSessionCount,
    hasRuntimeResources,
  };
}
