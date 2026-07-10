import os from "node:os";
import { randomUUID } from "node:crypto";
import { CodexAppServerAdapter, normalizeHistoricalThread } from "./adapters/codex-app-server-adapter.mjs";
import { createAgentEventEnvelope, countTextBytes, isAgentEventEnvelope, redactSecretText } from "./agent-events.mjs";

const MAX_REPLAY_EVENTS = 1_000;
const MAX_REPLAY_BYTES = 2 * 1024 * 1024;
const PERSIST_DEBOUNCE_MS = 250;
const INTERRUPT_FALLBACK_MS = 2_000;

// Codex readiness/inspection outside a live session must never touch the
// renderer-provided or process working directory; a fixed neutral directory
// keeps discovery/account/model reads from depending on whatever workspace
// happens to be active in this process.
const NEUTRAL_INSPECTION_ROOT = os.tmpdir();

export function createAgentService({
  appVersion,
  discovery,
  persistence,
  adapterFactory,
  logger = console,
}) {
  const sessions = new Map();
  let inspectionCache = null;

  async function discoverProviders(_sender, request = {}) {
    const internalReadiness = await discovery.discover({ refresh: Boolean(request?.refresh) });
    const readiness = publicReadiness(internalReadiness);
    if (readiness.status !== "ready") {
      inspectionCache = null;
      return { readiness, account: null, models: [], capabilities: null, warnings: [] };
    }
    const now = Date.now();
    if (!request?.refresh && inspectionCache && now - inspectionCache.createdAt < 30_000) {
      return inspectionCache.value;
    }
    const adapter = createAdapter({
      internalReadiness,
      workspaceRoot: NEUTRAL_INSPECTION_ROOT,
      onEvent: () => {},
      onExit: () => {},
    });
    try {
      const inspection = await adapter.inspect();
      const value = { readiness: readinessWithAccountState(readiness, inspection.account), ...inspection };
      inspectionCache = { createdAt: now, value };
      return value;
    } catch (error) {
      const message = redactSecretText(error instanceof Error ? error.message : String(error));
      return {
        readiness: { ...readiness, status: "error", message },
        account: null,
        models: [],
        capabilities: null,
        warnings: [message],
      };
    } finally {
      adapter.dispose();
    }
  }

  async function listModels(_sender, request = {}, workspaceRoot = null) {
    const internalReadiness = await discovery.discover({ refresh: false });
    if (internalReadiness.status !== "ready") return [];
    const now = Date.now();
    if (!request?.refresh && inspectionCache && now - inspectionCache.createdAt < 30_000) {
      return inspectionCache.value.models;
    }
    const adapter = createAdapter({
      internalReadiness,
      workspaceRoot: workspaceRoot || NEUTRAL_INSPECTION_ROOT,
      onEvent: () => {},
      onExit: () => {},
    });
    try {
      const inspection = await adapter.inspect();
      return inspection.models;
    } finally {
      adapter.dispose();
    }
  }

  async function readAccount(_sender, request = {}, workspaceRoot = null) {
    const internalReadiness = await discovery.discover({ refresh: false });
    if (internalReadiness.status !== "ready") return null;
    const now = Date.now();
    if (!request?.refresh && inspectionCache && now - inspectionCache.createdAt < 30_000) {
      return inspectionCache.value.account;
    }
    const adapter = createAdapter({
      internalReadiness,
      workspaceRoot: workspaceRoot || NEUTRAL_INSPECTION_ROOT,
      onEvent: () => {},
      onExit: () => {},
    });
    try {
      const inspection = await adapter.inspect();
      return inspection.account;
    } finally {
      adapter.dispose();
    }
  }

  async function createSession(sender, request, workspaceRoot) {
    requireSenderId(sender);
    requireWorkspaceRoot(workspaceRoot);
    const internalReadiness = await discovery.discover({ refresh: false });
    assertReady(internalReadiness);
    const session = createSessionRecord({
      id: randomUUID(),
      sender,
      workspaceRoot,
      model: normalizeOptionalString(request?.model),
    });
    sessions.set(session.id, session);
    attachSenderCleanup(session);
    try {
      session.adapter = createAdapterForSession(session, internalReadiness);
      const inspection = await session.adapter.inspect();
      assertAuthenticated(inspection.account);
      session.account = inspection.account;
      session.models = inspection.models;
      session.capabilities = inspection.capabilities;
      const providerSession = await session.adapter.createSession({ model: session.selectedModel });
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
  }

  async function resumeSession(sender, request, workspaceRoot) {
    requireSenderId(sender);
    requireWorkspaceRoot(workspaceRoot);
    const persisted = await persistence.findLatest(workspaceRoot);
    if (!persisted) return null;
    const existing = sessions.get(persisted.sessionId);
    if (existing) return sessionSnapshot(requireOwnedSession(sender, existing.id));
    const internalReadiness = await discovery.discover({ refresh: false });
    assertReady(internalReadiness);
    const session = createSessionRecord({
      id: persisted.sessionId,
      sender,
      workspaceRoot,
      model: normalizeOptionalString(persisted.selectedModel),
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
      session.adapter = createAdapterForSession(session, internalReadiness);
      const inspection = await session.adapter.inspect();
      assertAuthenticated(inspection.account);
      session.account = inspection.account;
      session.models = inspection.models;
      session.capabilities = inspection.capabilities;
      const providerSession = await session.adapter.resumeSession({
        threadId: persisted.providerSessionId,
        model: session.selectedModel,
      });
      applyProviderSession(session, providerSession);
      if (session.events.length === 0) {
        const thread = await session.adapter.readThread();
        for (const historicalEvent of normalizeHistoricalThread(thread)) emit(session, historicalEvent, { deliver: false });
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
      throw new Error(`Unable to resume Codex session: ${redactSecretText(error instanceof Error ? error.message : String(error))}`);
    }
  }

  async function startTurn(sender, request) {
    const session = requireOwnedSession(sender, request?.sessionId);
    if (session.activeTurnId || session.turnStarting) throw new Error("A Codex turn is already running.");
    const prompt = normalizePrompt(request?.prompt);
    const model = normalizeOptionalString(request?.model) || session.selectedModel;
    session.pendingPrompt = prompt;
    session.turnStarting = true;
    session.selectedModel = model;
    try {
      const result = await session.adapter.startTurn({ prompt, model });
      session.activeTurnId = result.turnId;
      if (session.lastStartedTurnId !== result.turnId) {
        emit(session, {
          type: "turn.started",
          providerSessionId: session.providerSessionId,
          turnId: result.turnId,
          payload: { status: "running", prompt, model },
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

  async function steerTurn(sender, request) {
    const session = requireOwnedSession(sender, request?.sessionId);
    const turnId = normalizeRequiredId(request?.turnId, "Turn id");
    if (session.activeTurnId !== turnId) throw new Error("That Codex turn is no longer running.");
    if (!session.capabilities?.steer || typeof session.adapter.steerTurn !== "function") {
      throw new Error("The active Codex session does not support steering a running turn.");
    }
    const message = normalizePrompt(request?.message);
    await session.adapter.steerTurn({ turnId, message });
    return { sessionId: session.id, turnId, steered: true };
  }

  async function interruptTurn(sender, request) {
    const session = requireOwnedSession(sender, request?.sessionId);
    const turnId = normalizeRequiredId(request?.turnId, "Turn id");
    if (session.activeTurnId !== turnId) throw new Error("That Codex turn is no longer running.");
    failPendingApprovalsClosed(session, "turn-interrupted");
    scheduleInterruptFallback(session, turnId);
    try {
      await session.adapter.interruptTurn({ turnId });
    } catch (error) {
      throw new Error(redactSecretText(error instanceof Error ? error.message : String(error)));
    }
    return { sessionId: session.id, turnId, interruptRequested: true };
  }

  function resolveQuestion(sender, request) {
    requireOwnedSession(sender, request?.sessionId);
    normalizeRequiredId(request?.turnId, "Turn id");
    normalizeRequiredId(request?.requestId, "Question request id");
    // Structured questions remain Proposed (capability-gated and unimplemented
    // by every current adapter); every request fails closed rather than hang.
    throw new Error("Structured questions are not supported by the active Codex session yet.");
  }

  function resolveApproval(sender, request) {
    const session = requireOwnedSession(sender, request?.sessionId);
    const requestId = normalizeRequiredId(request?.requestId, "Approval request id");
    const pending = session.pendingApprovals.get(requestId);
    if (!pending) throw new Error("This approval is stale or already resolved.");
    const turnId = normalizeRequiredId(request?.turnId, "Turn id");
    if (pending.turnId !== turnId || pending.provider !== "codex") {
      throw new Error("Approval correlation does not match the active request.");
    }
    const decision = normalizeApprovalDecision(request?.decision);
    session.adapter.resolveApproval({
      requestId,
      decision,
      threadId: session.providerSessionId,
      turnId,
    });
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
  }

  function replay(sender, request) {
    const session = requireOwnedSession(sender, request?.sessionId);
    const afterSequence = normalizeSequence(request?.afterSequence);
    const firstSequence = session.events[0]?.sequence ?? session.sequence + 1;
    return {
      session: sessionMetadata(session),
      account: session.account,
      models: session.models,
      capabilities: session.capabilities,
      events: session.events.filter((event) => event.sequence > afterSequence),
      partial: afterSequence > 0 && afterSequence < firstSequence - 1,
      firstAvailableSequence: firstSequence,
      lastSequence: session.sequence,
    };
  }

  async function closeSession(sender, request) {
    const session = requireOwnedSession(sender, request?.sessionId);
    const removePersistence = Boolean(request?.removePersistence);
    await closeSessionRecord(session, { persist: !removePersistence, removePersistence });
    return { sessionId: session.id, closed: true };
  }

  function closeSessionsForWindow(webContentsId) {
    return Promise.all(Array.from(sessions.values())
      .filter((session) => session.ownerId === webContentsId)
      .map((session) => closeSessionRecord(session, { persist: true })));
  }

  function closeAll() {
    return Promise.all(Array.from(sessions.values())
      .map((session) => closeSessionRecord(session, { persist: true })));
  }

  function getSessionCount() {
    return sessions.size;
  }

  function createAdapterForSession(session, internalReadiness) {
    return createAdapter({
      internalReadiness,
      workspaceRoot: session.workspaceRoot,
      onEvent: (event) => handleAdapterEvent(session, event),
      onExit: (info) => handleAdapterExit(session, info),
    });
  }

  function createAdapter({ internalReadiness, workspaceRoot, onEvent, onExit }) {
    const options = {
      executablePath: internalReadiness.executablePath,
      environment: internalReadiness.environment,
      workspaceRoot,
      appVersion,
      onEvent,
      onExit,
    };
    return adapterFactory ? adapterFactory(options) : new CodexAppServerAdapter(options);
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
    if (event.type === "turn.started") {
      session.activeTurnId = event.turnId;
      session.lastStartedTurnId = event.turnId;
      session.terminalState = "running";
      if (session.pendingPrompt) {
        event.payload = { ...(event.payload || {}), prompt: session.pendingPrompt, model: session.selectedModel };
      }
    }
    if (["turn.completed", "turn.failed", "turn.interrupted"].includes(event.type)) {
      session.activeTurnId = null;
      session.terminalState = event.type.slice("turn.".length);
      clearInterruptFallback(session);
    }
    if (event.type === "approval.requested") {
      const requestId = event.payload?.requestId;
      if (typeof requestId !== "string") return;
      session.pendingApprovals.set(requestId, {
        requestId,
        turnId: event.turnId,
        itemId: event.itemId,
        provider: "codex",
      });
    }
    if (event.type === "approval.resolved") {
      const requestId = event.payload?.requestId;
      // Avoid re-emitting a resolution already surfaced by
      // failPendingApprovalsClosed (interrupt/close) for the same request.
      if (!session.pendingApprovals.delete(requestId)) return;
    }
    emit(session, event);
  }

  function handleAdapterExit(session, info) {
    if (sessions.get(session.id) !== session || session.closing || info?.expected) return;
    clearInterruptFallback(session);
    failPendingApprovalsClosed(session, "provider-exited");
    if (session.activeTurnId) {
      emit(session, {
        type: "turn.failed",
        providerSessionId: session.providerSessionId,
        turnId: session.activeTurnId,
        payload: { status: "failed", message: "Codex app-server exited before the turn completed." },
      });
      session.activeTurnId = null;
    }
    session.terminalState = "provider-exited";
    emit(session, {
      type: "provider.error",
      providerSessionId: session.providerSessionId,
      payload: {
        message: "Codex app-server exited. Files already changed on disk were not reverted.",
        diagnostic: redactSecretText(info?.diagnostics || info?.error || ""),
        recoverable: true,
      },
    });
    sendSessionExit(session, "provider-exited");
    persistSoon(session);
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

  function scheduleInterruptFallback(session, turnId) {
    clearInterruptFallback(session);
    session.interruptFallbackTimer = setTimeout(() => {
      session.interruptFallbackTimer = null;
      if (sessions.get(session.id) !== session || session.closing) return;
      if (session.activeTurnId !== turnId) return;
      session.activeTurnId = null;
      session.terminalState = "interrupted";
      emit(session, {
        type: "turn.interrupted",
        providerSessionId: session.providerSessionId,
        turnId,
        payload: { status: "interrupted", message: "Codex did not confirm the interrupt in time." },
      });
    }, INTERRUPT_FALLBACK_MS);
    session.interruptFallbackTimer.unref?.();
  }

  function clearInterruptFallback(session) {
    if (!session.interruptFallbackTimer) return;
    clearTimeout(session.interruptFallbackTimer);
    session.interruptFallbackTimer = null;
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
    try {
      session.adapter?.dispose();
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
      providerSessionId: session.providerSessionId,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      terminalState: session.terminalState,
      selectedModel: session.selectedModel,
      lastSequence: session.sequence,
      events: session.events,
    });
  }

  function attachSenderCleanup(session) {
    session.sender.once?.("destroyed", () => {
      void closeSessionsForWindow(session.ownerId);
    });
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

  function createSessionRecord({ id, sender, workspaceRoot, model, events = [], sequence = 0, createdAt, title }) {
    const restoredEvents = Array.isArray(events) ? events.filter(isAgentEventEnvelope).slice(-MAX_REPLAY_EVENTS) : [];
    const highestSequence = restoredEvents.reduce((highest, event) => Math.max(highest, event.sequence), 0);
    return {
      id,
      ownerId: requireSenderId(sender),
      sender,
      workspaceRoot,
      providerSessionId: null,
      adapter: null,
      activeTurnId: null,
      lastStartedTurnId: null,
      pendingPrompt: null,
      turnStarting: false,
      pendingApprovals: new Map(),
      sequence: Math.max(normalizeSequence(sequence), highestSequence),
      events: restoredEvents,
      replayBytes: restoredEvents.reduce((total, event) => total + countTextBytes(event), 0),
      account: null,
      models: [],
      capabilities: null,
      selectedModel: model,
      title: title || "Codex session",
      createdAt: createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      terminalState: "idle",
      persistTimer: null,
      interruptFallbackTimer: null,
      closing: false,
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
    closeSession,
    closeSessionsForWindow,
    closeAll,
    getSessionCount,
  };
}

function applyProviderSession(session, providerSession) {
  session.providerSessionId = providerSession.providerSessionId;
  session.title = providerSession.title || session.title;
  session.selectedModel = providerSession.model || session.selectedModel;
  session.createdAt = providerSession.createdAt || session.createdAt;
  session.updatedAt = providerSession.updatedAt || new Date().toISOString();
}

function sessionMetadata(session) {
  return {
    id: session.id,
    provider: "codex",
    providerSessionId: session.providerSessionId,
    workspaceRoot: session.workspaceRoot,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    terminalState: session.terminalState,
    selectedModel: session.selectedModel,
    activeTurnId: session.activeTurnId,
    lastSequence: session.sequence,
  };
}

function sessionSnapshot(session) {
  return {
    session: sessionMetadata(session),
    account: session.account,
    models: session.models,
    capabilities: session.capabilities,
    events: session.events,
    partial: Boolean(session.events[0] && session.events[0].sequence > 1),
    firstAvailableSequence: session.events[0]?.sequence ?? session.sequence + 1,
    lastSequence: session.sequence,
  };
}

function publicReadiness(readiness) {
  return {
    provider: "codex",
    status: readiness.status,
    version: readiness.version ?? null,
    minimumVersion: readiness.minimumVersion ?? null,
    message: readiness.message || "",
    ...(readiness.diagnostic ? { diagnostic: redactSecretText(readiness.diagnostic) } : {}),
  };
}

function readinessWithAccountState(readiness, accountState) {
  if (readiness.status === "ready" && accountState?.requiresOpenaiAuth && !accountState?.account) {
    return {
      ...readiness,
      status: "installed-not-authenticated",
      message: readiness.message && readiness.message !== "Codex is ready."
        ? readiness.message
        : "Codex is installed but not signed in. Run `codex login` in a terminal, then refresh.",
    };
  }
  return readiness;
}

function assertReady(readiness) {
  if (readiness?.status !== "ready" || !readiness.executablePath) {
    throw new Error(readiness?.message || "Codex is not ready.");
  }
}

function assertAuthenticated(accountState) {
  if (accountState?.requiresOpenaiAuth && !accountState?.account) {
    throw new Error("Codex setup is required. Run `codex login` in a terminal, then refresh.");
  }
}

function requireWorkspaceRoot(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("No authorized local workspace is assigned to this Agent session.");
  }
}

function requireSenderId(sender) {
  if (!Number.isSafeInteger(sender?.id) || sender.id <= 0) throw new Error("Agent IPC sender is invalid.");
  return sender.id;
}

function normalizePrompt(value) {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error("Enter a message for Codex.");
  if (value.length > 128 * 1024) throw new Error("The Codex message is too large.");
  return value;
}

function normalizeRequiredId(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9:_-]{1,160}$/.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function normalizeOptionalString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim().slice(0, 200) : null;
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
