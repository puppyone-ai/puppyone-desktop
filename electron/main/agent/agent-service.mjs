import os from "node:os";
import { randomUUID } from "node:crypto";
import { createAgentEventEnvelope, countTextBytes, isAgentEventEnvelope, redactSecretText } from "./agent-events.mjs";
import {
  createLegacyCodexRuntimeRegistry,
  publicRuntimeReadiness,
} from "./runtime/agent-runtime-registry.mjs";
import { normalizeCapabilitySnapshot } from "./runtime/agent-runtime-port.mjs";

const MAX_REPLAY_EVENTS = 1_000;
const MAX_REPLAY_BYTES = 2 * 1024 * 1024;
const PERSIST_DEBOUNCE_MS = 750;
const INTERRUPT_CONFIRMATION_TIMEOUT_MS = 5_000;
const MAX_TERMINAL_TURN_IDS = 128;
const MAX_REFERENCE_SNAPSHOT_URL_LENGTH = Math.ceil(25 * 1024 * 1024 * 4 / 3) + 256;

// Runtime readiness/inspection outside a live session must never touch the
// renderer-provided or process working directory; a fixed neutral directory
// keeps discovery/account/model reads from depending on whatever workspace
// happens to be active in this process.
const NEUTRAL_INSPECTION_ROOT = os.tmpdir();

export function createAgentService({
  appVersion,
  runtimeRegistry: suppliedRuntimeRegistry,
  discovery,
  persistence,
  adapterFactory,
  logger = console,
}) {
  const runtimeRegistry = suppliedRuntimeRegistry ?? createLegacyCodexRuntimeRegistry({
    discovery,
    adapterFactory,
    appVersion,
  });
  const sessions = new Map();
  const ownerCleanups = new Map();
  const sessionCreations = new Set();
  const inspectionCache = new Map();

  async function discoverProviders(_sender, request = {}, workspaceRoot = null) {
    const catalog = await runtimeRegistry.discover({ refresh: Boolean(request?.refresh) });
    if (request?.refresh) inspectionCache.clear();
    const selected = selectRequestedRuntime(catalog, request?.runtimeId);
    const runtimes = catalog.map((entry) => ({
      descriptor: { ...entry.descriptor },
      readiness: publicRuntimeReadiness(entry),
    }));
    if (!selected) {
      return {
        runtimes,
        selectedRuntimeId: null,
        readiness: unavailableReadiness("No Agent runtime is registered."),
        account: null,
        models: [],
        modes: [],
        commands: [],
        capabilities: null,
        warnings: [],
      };
    }
    const publicReadiness = publicRuntimeReadiness(selected);
    if (publicReadiness.status !== "ready") {
      return {
        runtimes,
        selectedRuntimeId: selected.descriptor.id,
        readiness: publicReadiness,
        account: null,
        models: [],
        modes: [],
        commands: [],
        capabilities: null,
        runtime: { ...selected.descriptor },
        warnings: [],
      };
    }
    try {
      const inspection = await inspectRuntime({
        runtimeId: selected.descriptor.id,
        readiness: selected.readiness,
        workspaceRoot: workspaceRoot || NEUTRAL_INSPECTION_ROOT,
        refresh: Boolean(request?.refresh),
      });
      return {
        runtimes,
        selectedRuntimeId: selected.descriptor.id,
        readiness: readinessWithAccountState(publicReadiness, inspection.account, selected.descriptor.displayName),
        ...inspection,
      };
    } catch (error) {
      const message = redactSecretText(error instanceof Error ? error.message : String(error));
      return {
        runtimes,
        selectedRuntimeId: selected.descriptor.id,
        readiness: { ...publicReadiness, status: "error", message },
        account: null,
        models: [],
        modes: [],
        commands: [],
        capabilities: null,
        runtime: { ...selected.descriptor },
        warnings: [message],
      };
    }
  }

  async function inspectRuntime({ runtimeId, readiness, workspaceRoot, refresh = false }) {
    const key = `${runtimeId}\0${workspaceRoot}`;
    const now = Date.now();
    const cached = inspectionCache.get(key);
    if (!refresh && cached && now - cached.createdAt < 30_000) return cached.value;
    const adapter = createAdapter({
      runtimeId,
      internalReadiness: readiness,
      workspaceRoot,
      onEvent: () => {},
      onExit: () => {},
    });
    try {
      const inspection = await adapter.inspect();
      const value = {
        account: inspection.account ?? null,
        models: Array.isArray(inspection.models) ? inspection.models : [],
        modes: Array.isArray(inspection.modes) ? inspection.modes : [],
        commands: Array.isArray(inspection.commands) ? inspection.commands : [],
        capabilities: normalizeCapabilitySnapshot(inspection.capabilities),
        runtime: inspection.runtime ?? runtimeRegistry.require(runtimeId).descriptor,
        warnings: Array.isArray(inspection.warnings) ? inspection.warnings : [],
      };
      inspectionCache.set(key, { createdAt: now, value });
      return value;
    } finally {
      await adapter.dispose();
    }
  }

  async function listModels(sender, request = {}, workspaceRoot = null) {
    const inspection = await discoverProviders(sender, request, workspaceRoot);
    return inspection.models;
  }

  async function readAccount(sender, request = {}, workspaceRoot = null) {
    const inspection = await discoverProviders(sender, request, workspaceRoot);
    return inspection.account;
  }

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
        sender,
        workspaceRoot,
        runtimeId: selected.descriptor.id,
        runtime: selected.descriptor,
        model: normalizeOptionalString(request?.model),
        mode: normalizeOptionalString(request?.mode),
      });
      sessions.set(session.id, session);
      attachSenderCleanup(session);
      try {
        session.adapter = createAdapterForSession(session, selected.readiness);
        const inspection = await session.adapter.inspect();
        assertAuthenticated(inspection.account);
        applyInspection(session, inspection);
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
      const existing = sessions.get(persisted.sessionId);
      if (existing) return sessionSnapshot(requireOwnedSession(sender, existing.id));
      const runtimeId = normalizeRuntimeId(persisted.runtimeId || persisted.provider || request?.runtimeId) || "codex";
      const catalog = await runtimeRegistry.discover({ refresh: false });
      const selected = runtimeRegistry.select(catalog, runtimeId);
      if (!selected || selected.descriptor.id !== runtimeId) throw new Error(`Agent runtime ${runtimeId} is not registered.`);
      assertReady(selected.readiness, selected.descriptor.displayName);
      const session = createSessionRecord({
        id: persisted.sessionId,
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
      sessions.set(session.id, session);
      attachSenderCleanup(session);
      try {
        session.adapter = createAdapterForSession(session, selected.readiness);
        const inspection = await session.adapter.inspect();
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
    return records.map(publicSessionRecord);
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
      sender,
      workspaceRoot: source.workspaceRoot,
      runtimeId: source.runtimeId,
      runtime: source.runtime,
      model: source.selectedModel,
      mode: source.selectedMode,
      title: `${source.title} (fork)`,
    });
    sessions.set(session.id, session);
    attachSenderCleanup(session);
    try {
      session.adapter = createAdapterForSession(session, selected.readiness);
      const inspection = await session.adapter.inspect();
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
    const active = sessions.get(sessionId);
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
    const active = sessions.get(sessionId);
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
    return Promise.all(Array.from(sessions.values())
      .filter((session) => session.ownerId === webContentsId)
      .map((session) => closeSessionRecord(session, { persist: true })));
  }

  async function closeAll() {
    await Promise.all(Array.from(sessions.values())
      .map((session) => closeSessionRecord(session, { persist: true })));
    await runtimeRegistry.dispose?.();
  }

  function getSessionCount() {
    return Array.from(sessions.values()).filter((session) => !session.providerExited).length;
  }

  function getRetainedSessionCount() {
    return sessions.size;
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
    if (sessions.get(session.id) !== session || session.closing) return;
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
    if (sessions.get(session.id) !== session || session.closing || session.providerExited || info?.expected || !session.providerSessionId) return;
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
      if (sessions.get(session.id) !== session || session.closing) return;
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
    if (sessions.get(session.id) !== session || session.closing || session.providerExited) return;
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

  function sendSessionExit(session, reason) {
    if (session.sender?.isDestroyed?.()) return;
    try {
      session.sender.send("agent:session-exit", { sessionId: session.id, reason });
    } catch (error) {
      logger.warn?.("Unable to deliver Desktop Agent session-exit:", redactSecretText(error?.message || String(error)));
    }
  }

  function emit(session, adapterEvent, { deliver = true } = {}) {
    const envelope = createAgentEventEnvelope({
      sequence: ++session.sequence,
      sessionId: session.id,
      runtimeId: session.runtimeId,
      providerSessionId: adapterEvent.providerSessionId ?? session.providerSessionId,
      turnId: adapterEvent.turnId ?? null,
      itemId: adapterEvent.itemId ?? null,
      type: adapterEvent.type,
      payload: adapterEvent.payload ?? {},
    });
    session.events.push(envelope);
    session.replayBytes += countTextBytes(envelope);
    while (
      session.events.length > MAX_REPLAY_EVENTS
      || (session.replayBytes > MAX_REPLAY_BYTES && session.events.length > 1)
    ) {
      const removed = session.events.shift();
      session.replayBytes -= countTextBytes(removed);
    }
    session.updatedAt = envelope.emittedAt;
    if (deliver && !session.sender.isDestroyed?.()) {
      try {
        session.sender.send("agent:event", envelope);
      } catch (error) {
        logger.warn?.("Unable to deliver Desktop Agent event:", redactSecretText(error?.message || String(error)));
      }
    }
    persistSoon(session);
    return envelope;
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
      if (sessions.get(session.id) === session) {
        session.closing = false;
        emit(session, {
          type: "session.closed",
          providerSessionId: session.providerSessionId,
          payload: { terminalState: session.terminalState },
        }, { deliver: !session.sender.isDestroyed?.() });
        session.closing = true;
        sessions.delete(session.id);
        detachSenderCleanup(session);
      }
      sendSessionExit(session, "closed");
      if (removePersistence) await persistence.remove(session.id);
      else if (persist) await persistNow(session);
    }
  }

  function persistSoon(session) {
    if (session.closing || session.persistTimer) return;
    session.persistTimer = setTimeout(() => {
      session.persistTimer = null;
      void persistNow(session);
    }, PERSIST_DEBOUNCE_MS);
    session.persistTimer.unref?.();
  }

  function persistNow(session) {
    if (!session.providerSessionId) return Promise.resolve();
    return persistence.save({
      sessionId: session.id,
      workspaceRoot: session.workspaceRoot,
      runtimeId: session.runtimeId,
      runtime: session.runtime,
      providerSessionId: session.providerSessionId,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      terminalState: session.terminalState,
      selectedModel: session.selectedModel,
      selectedMode: session.selectedMode,
      lastSequence: session.sequence,
      events: session.events,
    });
  }

  function attachSenderCleanup(session) {
    let cleanup = ownerCleanups.get(session.ownerId);
    if (!cleanup) {
      const onDestroyed = () => {
        ownerCleanups.delete(session.ownerId);
        void closeSessionsForWindow(session.ownerId);
      };
      cleanup = { sender: session.sender, onDestroyed, sessionIds: new Set() };
      ownerCleanups.set(session.ownerId, cleanup);
      session.sender.once?.("destroyed", onDestroyed);
    }
    cleanup.sessionIds.add(session.id);
  }

  function detachSenderCleanup(session) {
    const cleanup = ownerCleanups.get(session.ownerId);
    if (!cleanup) return;
    cleanup.sessionIds.delete(session.id);
    if (cleanup.sessionIds.size > 0) return;
    cleanup.sender.removeListener?.("destroyed", cleanup.onDestroyed);
    ownerCleanups.delete(session.ownerId);
  }

  function takeRetiredSession(ownerId, workspaceRoot, requestedSessionId = null) {
    const retired = Array.from(sessions.values())
      .filter((session) => (
        session.ownerId === ownerId
        && session.workspaceRoot === workspaceRoot
        && session.providerExited
        && session.providerSessionId
        && (!requestedSessionId || session.id === requestedSessionId)
      ))
      .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))[0] ?? null;
    if (!retired) return null;
    clearTimeout(retired.persistTimer);
    retired.persistTimer = null;
    sessions.delete(retired.id);
    detachSenderCleanup(retired);
    return retired;
  }

  function findOwnedSession(ownerId, workspaceRoot, { connectedOnly = false } = {}) {
    return Array.from(sessions.values())
      .filter((session) => (
        session.ownerId === ownerId
        && session.workspaceRoot === workspaceRoot
        && (!connectedOnly || !session.providerExited)
      ))
      .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))[0] ?? null;
  }

  function discardRetiredSessions(ownerId, workspaceRoot) {
    for (const session of Array.from(sessions.values())) {
      if (session.ownerId !== ownerId || session.workspaceRoot !== workspaceRoot || !session.providerExited) continue;
      clearTimeout(session.persistTimer);
      session.persistTimer = null;
      sessions.delete(session.id);
      detachSenderCleanup(session);
    }
  }

  function requireOwnedSession(sender, id) {
    const normalizedId = normalizeRequiredId(id, "Agent session id");
    const session = sessions.get(normalizedId);
    if (!session) throw new Error("Agent session was not found or has already closed.");
    if (session.ownerId !== requireSenderId(sender)) {
      throw new Error("Agent session is owned by another window.");
    }
    return session;
  }

  function createSessionRecord({
    id,
    sender,
    workspaceRoot,
    runtimeId,
    runtime,
    model,
    mode,
    events = [],
    sequence = 0,
    createdAt,
    title,
  }) {
    const restoredEvents = Array.isArray(events) ? events.filter(isAgentEventEnvelope).slice(-MAX_REPLAY_EVENTS) : [];
    const highestSequence = restoredEvents.reduce((highest, event) => Math.max(highest, event.sequence), 0);
    return {
      id,
      ownerId: requireSenderId(sender),
      sender,
      workspaceRoot,
      runtimeId,
      runtime: runtime ? { ...runtime } : { id: runtimeId, displayName: runtimeId },
      providerSessionId: null,
      adapter: null,
      activeTurnId: null,
      lastStartedTurnId: null,
      pendingPrompt: null,
      turnStarting: false,
      interruptingTurnId: null,
      terminalTurnIds: new Set(),
      pendingApprovals: new Map(),
      pendingQuestions: new Map(),
      sequence: Math.max(normalizeSequence(sequence), highestSequence),
      events: restoredEvents,
      replayBytes: restoredEvents.reduce((total, event) => total + countTextBytes(event), 0),
      account: null,
      models: [],
      modes: [],
      commands: [],
      capabilities: null,
      selectedModel: model,
      selectedMode: mode,
      title: title || `${runtime?.displayName || "Agent"} session`,
      createdAt: createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      terminalState: "idle",
      persistTimer: null,
      interruptFallbackTimer: null,
      closing: false,
      providerExited: false,
      lifecycleEventSeen: false,
    };
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

function requireConnectedSession(session) {
  if (session.providerExited || !session.adapter) {
    throw new Error(`${session.runtime?.displayName || "Agent runtime"} is disconnected. Refresh to resume the saved session.`);
  }
}

function persistedRecordFromSession(session) {
  return {
    sessionId: session.id,
    workspaceRoot: session.workspaceRoot,
    runtimeId: session.runtimeId,
    runtime: session.runtime,
    provider: session.runtimeId,
    providerSessionId: session.providerSessionId,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    terminalState: session.terminalState,
    selectedModel: session.selectedModel,
    selectedMode: session.selectedMode,
    lastSequence: session.sequence,
    events: session.events,
  };
}

function rememberTerminalTurn(session, turnId) {
  if (typeof turnId !== "string" || turnId.length === 0) return;
  session.terminalTurnIds.add(turnId);
  if (session.terminalTurnIds.size > MAX_TERMINAL_TURN_IDS) {
    session.terminalTurnIds.delete(session.terminalTurnIds.values().next().value);
  }
}

function applyProviderSession(session, providerSession) {
  session.providerSessionId = providerSession.providerSessionId;
  session.title = providerSession.title || session.title;
  session.selectedModel = providerSession.model || session.selectedModel;
  session.selectedMode = providerSession.mode || session.selectedMode;
  session.createdAt = providerSession.createdAt || session.createdAt;
  session.updatedAt = providerSession.updatedAt || new Date().toISOString();
}

function applyInspection(session, inspection) {
  session.account = inspection.account ?? null;
  session.models = Array.isArray(inspection.models) ? inspection.models : [];
  session.modes = Array.isArray(inspection.modes) ? inspection.modes : [];
  session.commands = Array.isArray(inspection.commands) ? inspection.commands : [];
  session.capabilities = normalizeCapabilitySnapshot(inspection.capabilities);
  if (inspection.runtime) session.runtime = { ...session.runtime, ...inspection.runtime };
  if (!session.selectedModel) {
    session.selectedModel = session.models.find((model) => model.isDefault)?.model ?? session.models[0]?.model ?? null;
  }
  if (!session.selectedMode) {
    session.selectedMode = session.modes.find((mode) => mode.isDefault)?.id ?? session.modes[0]?.id ?? null;
  }
}

function publicSessionRecord(record) {
  const runtimeId = record.runtimeId || record.provider || "codex";
  return {
    id: record.sessionId,
    runtimeId,
    provider: runtimeId,
    runtime: record.runtime ?? null,
    providerSessionId: record.providerSessionId ?? null,
    workspaceRoot: record.workspaceRoot,
    title: record.title || "Agent session",
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    archivedAt: record.archivedAt ?? null,
    terminalState: record.terminalState || "idle",
    selectedModel: record.selectedModel ?? null,
    selectedMode: record.selectedMode ?? null,
    lastSequence: normalizeSequence(record.lastSequence),
    partial: Boolean(record.partial),
  };
}

function sessionMetadata(session) {
  return {
    id: session.id,
    runtimeId: session.runtimeId,
    runtime: session.runtime,
    provider: session.runtimeId,
    providerSessionId: session.providerSessionId,
    workspaceRoot: session.workspaceRoot,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    terminalState: session.terminalState,
    selectedModel: session.selectedModel,
    selectedMode: session.selectedMode,
    activeTurnId: session.activeTurnId,
    lastSequence: session.sequence,
  };
}

function sessionSnapshot(session) {
  return {
    session: sessionMetadata(session),
    account: session.account,
    models: session.models,
    modes: session.modes,
    commands: session.commands,
    capabilities: session.capabilities,
    runtime: session.runtime,
    events: session.events,
    partial: Boolean(session.events[0] && session.events[0].sequence > 1),
    firstAvailableSequence: session.events[0]?.sequence ?? session.sequence + 1,
    lastSequence: session.sequence,
  };
}

function readinessWithAccountState(readiness, accountState, runtimeName = "Agent runtime") {
  if (readiness.status === "ready" && requiresRuntimeSetup(accountState)) {
    return {
      ...readiness,
      status: "installed-not-authenticated",
      message: readiness.message && readiness.message !== `${runtimeName} is ready.`
        ? readiness.message
        : `${runtimeName} is installed but not signed in. Complete setup in a terminal, then refresh.`,
    };
  }
  return readiness;
}

function assertReady(readiness, runtimeName = "Agent runtime") {
  if (readiness?.status !== "ready" || !readiness.executablePath) {
    throw new Error(readiness?.message || `${runtimeName} is not ready.`);
  }
}

function assertAuthenticated(accountState) {
  if (requiresRuntimeSetup(accountState)) {
    throw new Error("Agent runtime setup is required. Complete authentication in a terminal, then refresh.");
  }
}

function requiresRuntimeSetup(accountState) {
  return Boolean(
    !accountState?.account
    && (accountState?.requiresOpenaiAuth || accountState?.requiresRuntimeSetup),
  );
}

function requireWorkspaceRoot(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("No authorized local workspace is assigned to this Agent session.");
  }
}

function requireMatchingWorkspace(session, workspaceRoot) {
  // Direct service-level callers used by tests and legacy embedding may omit
  // this proof. Trusted IPC always supplies the canonical authorized root.
  if (workspaceRoot === null || workspaceRoot === undefined) return;
  requireWorkspaceRoot(workspaceRoot);
  if (session.workspaceRoot !== workspaceRoot) {
    throw new Error("Agent session does not belong to the assigned workspace.");
  }
}

function requireSenderId(sender) {
  if (!Number.isSafeInteger(sender?.id) || sender.id <= 0) throw new Error("Agent IPC sender is invalid.");
  return sender.id;
}

function normalizePrompt(value) {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error("Enter a message for the Agent.");
  if (value.length > 128 * 1024) throw new Error("The Agent message is too large.");
  return value;
}

function normalizeRequiredId(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9:_-]{1,160}$/.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function normalizeOptionalString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim().slice(0, 200) : null;
}

function normalizeRuntimeId(value) {
  return typeof value === "string" && /^[a-z][a-z0-9-]{1,39}$/.test(value) ? value : null;
}

function normalizeOptionalId(value) {
  return typeof value === "string" && /^[A-Za-z0-9:_-]{1,160}$/.test(value) ? value : null;
}

function normalizeAuthorizedReferences(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 32).flatMap((entry) => {
    if (!entry || typeof entry !== "object" || entry.authorized !== true) return [];
    if (typeof entry.path !== "string" || entry.path.length === 0 || entry.path.length > 4_096) return [];
    return [{
      path: entry.path,
      name: normalizeOptionalString(entry.name),
      mime: normalizeOptionalString(entry.mime),
      ...(isBoundedDataUrl(entry.snapshotUrl) ? { snapshotUrl: entry.snapshotUrl } : {}),
    }];
  });
}

function isBoundedDataUrl(value) {
  if (typeof value !== "string" || value.length > MAX_REFERENCE_SNAPSHOT_URL_LENGTH) return false;
  const marker = value.indexOf(";base64,");
  return value.startsWith("data:") && marker > 5 && marker < 200 && !value.slice(0, marker).includes("\n");
}

function normalizeQuestionAnswers(value, questions) {
  if (value === null || value === undefined) return null;
  let rows;
  if (typeof value === "string") rows = [[value]];
  else if (Array.isArray(value) && value.every(Array.isArray)) rows = value;
  else if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
    rows = Array.isArray(questions) && questions.length > 1
      ? value.map((entry) => [entry])
      : [value];
  } else {
    throw new Error("Question answers are invalid.");
  }
  return rows.slice(0, 8).map((row) => row
    .filter((entry) => typeof entry === "string")
    .map((entry) => entry.trim().slice(0, 4_000))
    .filter(Boolean)
    .slice(0, 20));
}

function unavailableReadiness(message) {
  return {
    runtimeId: "unknown",
    provider: "unknown",
    status: "error",
    version: null,
    minimumVersion: null,
    message,
    source: "missing",
    compatibility: "unavailable",
  };
}

function normalizeApprovalDecision(value) {
  if (!["accept", "acceptForSession", "decline", "cancel"].includes(value)) {
    throw new Error("Approval decision is invalid.");
  }
  return value;
}

function normalizeSequence(value) {
  const sequence = Number(value);
  return Number.isSafeInteger(sequence) && sequence >= 0 ? sequence : 0;
}
