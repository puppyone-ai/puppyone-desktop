import { countTextBytes, isAgentEventEnvelope } from "../agent-events.mjs";
import { normalizeCapabilitySnapshot, sanitizeAgentRuntimeDescriptor } from "../../../../shared/agent-contract/schema.mjs";

const MAX_REPLAY_EVENTS = 1_000;
const MAX_TERMINAL_TURN_IDS = 128;

export function createAgentSessionRecord({
  id,
  ownerId,
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
    ownerId,
    sender,
    workspaceRoot,
    runtimeId,
    runtime: runtime ? { ...runtime } : { id: runtimeId, displayName: runtimeId },
    providerSessionId: null,
    adapter: null,
    activeTurnId: null,
    activeTurnStartedAtMs: null,
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
    providers: [],
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

export function requireConnectedSession(session) {
  if (session.providerExited || !session.adapter) {
    throw new Error(`${session.runtime?.displayName || "Agent runtime"} is disconnected. Refresh to resume the saved session.`);
  }
}

export function persistedRecordFromSession(session) {
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

export function rememberTerminalTurn(session, turnId) {
  if (typeof turnId !== "string" || turnId.length === 0) return;
  session.terminalTurnIds.add(turnId);
  if (session.terminalTurnIds.size > MAX_TERMINAL_TURN_IDS) {
    session.terminalTurnIds.delete(session.terminalTurnIds.values().next().value);
  }
}

export function applyProviderSession(session, providerSession) {
  session.providerSessionId = providerSession.providerSessionId;
  session.title = providerSession.title || session.title;
  session.selectedModel = providerSession.model || session.selectedModel;
  session.selectedMode = providerSession.mode || session.selectedMode;
  session.createdAt = providerSession.createdAt || session.createdAt;
  session.updatedAt = providerSession.updatedAt || new Date().toISOString();
}

export function applyInspection(session, inspection) {
  session.account = inspection.account ?? null;
  session.providers = Array.isArray(inspection.providers) ? inspection.providers : [];
  session.models = Array.isArray(inspection.models) ? inspection.models : [];
  session.modes = Array.isArray(inspection.modes) ? inspection.modes : [];
  session.commands = Array.isArray(inspection.commands) ? inspection.commands : [];
  session.capabilities = normalizeCapabilitySnapshot(inspection.capabilities);
  if (inspection.runtime) session.runtime = { ...session.runtime, ...sanitizeAgentRuntimeDescriptor(inspection.runtime) };
  if (session.selectedModel && !session.models.some((model) => model.model === session.selectedModel)) {
    session.selectedModel = null;
  }
  if (!session.selectedModel) {
    const providerIds = new Set(session.models.map(modelProviderId).filter(Boolean));
    if (providerIds.size <= 1) {
      const [providerId] = providerIds;
      const providerModels = providerId
        ? session.models.filter((model) => modelProviderId(model) === providerId)
        : session.models;
      session.selectedModel = providerModels.find((model) => model.isDefault)?.model ?? providerModels[0]?.model ?? null;
    }
  }
  if (!session.selectedMode) {
    session.selectedMode = session.modes.find((mode) => mode.isDefault)?.id ?? session.modes[0]?.id ?? null;
  }
}

export function publicSessionRecord(record) {
  const runtimeId = record.runtimeId || record.provider;
  if (typeof runtimeId !== "string" || runtimeId.length === 0) {
    throw new TypeError("A public Agent session record requires a migrated runtime id.");
  }
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

export function sessionMetadata(session) {
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

export function sessionSnapshot(session) {
  return {
    session: sessionMetadata(session),
    account: session.account,
    providers: session.providers,
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

function modelProviderId(model) {
  if (typeof model?.providerId === "string" && model.providerId) return model.providerId;
  if (typeof model?.model !== "string") return null;
  const slash = model.model.indexOf("/");
  return slash > 0 ? model.model.slice(0, slash) : null;
}

function normalizeSequence(value) {
  const sequence = Number(value);
  return Number.isSafeInteger(sequence) && sequence >= 0 ? sequence : 0;
}
