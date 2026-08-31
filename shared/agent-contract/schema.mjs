import { agentContractLimits } from "./constants.mjs";
import { assertAgentEventEnvelope } from "./event-schema.mjs";
import { sanitizeAgentLocalConnectionsSnapshot } from "./local-connection-schema.mjs";
import {
  assertAgentInspection,
  assertAgentInferenceProvider,
  assertAgentModel,
  sanitizeAgentRuntimeDescriptor,
} from "./runtime-schema.mjs";
import {
  assertArray,
  assertRecord,
  assertRuntimeId,
  compact,
  contractError,
  enumValue,
  nonNegativeInteger,
  optionalBoolean,
  optionalOpaqueId,
  optionalRecord,
  optionalRuntimeId,
  optionalString,
  requiredOpaqueId,
  requiredString,
} from "./validation.mjs";
import { normalizeAgentWorkspaceRelativePath } from "./reference-identity.mjs";

export * from "./constants.mjs";
export * from "./event-schema.mjs";
export * from "./local-connection-schema.mjs";
export * from "./runtime-schema.mjs";

const {
  maxPathLength: MAX_PATH_LENGTH,
  maxMessageLength: MAX_MESSAGE_LENGTH,
  maxReferenceCount: MAX_REFERENCE_COUNT,
} = agentContractLimits;

export function parseAgentIpcRequest(channel, value) {
  const input = optionalRecord(value, channel);
  switch (channel) {
    case "agent:providers-discover":
    case "agent:local-connections-discover":
    case "agent:models-list":
    case "agent:account-read":
      return compact({
        rootPath: optionalString(input.rootPath, "rootPath", MAX_PATH_LENGTH),
        runtimeId: optionalRuntimeId(input.runtimeId),
        refresh: optionalBoolean(input.refresh, "refresh"),
      });
    case "agent:session-create":
      return compact({
        rootPath: requiredString(input.rootPath, "rootPath", MAX_PATH_LENGTH),
        runtimeId: optionalRuntimeId(input.runtimeId),
        model: optionalString(input.model, "model", 512),
        effort: optionalString(input.effort, "effort", 160),
        mode: optionalString(input.mode, "mode", 160),
      });
    case "agent:session-resume":
      return compact({
        rootPath: requiredString(input.rootPath, "rootPath", MAX_PATH_LENGTH),
        sessionId: optionalOpaqueId(input.sessionId, "sessionId"),
        runtimeId: optionalRuntimeId(input.runtimeId),
      });
    case "agent:session-replay":
      return {
        rootPath: requiredString(input.rootPath, "rootPath", MAX_PATH_LENGTH),
        sessionId: requiredOpaqueId(input.sessionId, "sessionId"),
        afterSequence: nonNegativeInteger(input.afterSequence, "afterSequence"),
      };
    case "agent:sessions-list":
      return compact({
        rootPath: requiredString(input.rootPath, "rootPath", MAX_PATH_LENGTH),
        runtimeId: optionalRuntimeId(input.runtimeId),
        includeArchived: optionalBoolean(input.includeArchived, "includeArchived"),
        discoverNative: optionalBoolean(input.discoverNative, "discoverNative"),
        cursor: optionalString(input.cursor, "cursor", 1_024),
        limit: optionalPageSize(input.limit, "limit"),
      });
    case "agent:session-fork":
    case "agent:session-archive":
    case "agent:session-delete":
      return compact({
        rootPath: requiredString(input.rootPath, "rootPath", MAX_PATH_LENGTH),
        sessionId: requiredOpaqueId(input.sessionId, "sessionId"),
        messageId: optionalOpaqueId(input.messageId, "messageId"),
        archiveNative: optionalBoolean(input.archiveNative, "archiveNative"),
        deleteNative: optionalBoolean(input.deleteNative, "deleteNative"),
      });
    case "agent:session-close":
      return compact({
        rootPath: requiredString(input.rootPath, "rootPath", MAX_PATH_LENGTH),
        sessionId: requiredOpaqueId(input.sessionId, "sessionId"),
        removePersistence: optionalBoolean(input.removePersistence, "removePersistence"),
      });
    case "agent:reference-stage":
      return {
        rootPath: requiredString(input.rootPath, "rootPath", MAX_PATH_LENGTH),
        epoch: requiredOpaqueId(input.epoch, "epoch"),
        sourcePaths: boundedStringArray(input.sourcePaths, "sourcePaths", MAX_REFERENCE_COUNT, MAX_PATH_LENGTH),
      };
    case "agent:reference-revoke":
      return {
        rootPath: requiredString(input.rootPath, "rootPath", MAX_PATH_LENGTH),
        tokens: boundedOpaqueIdArray(input.tokens, "tokens", MAX_REFERENCE_COUNT),
      };
    case "agent:reference-resolve-workspace":
      return {
        rootPath: requiredString(input.rootPath, "rootPath", MAX_PATH_LENGTH),
        paths: boundedStringArray(input.paths, "paths", MAX_REFERENCE_COUNT, MAX_PATH_LENGTH),
      };
    case "agent:reference-pick-workspace":
      return { rootPath: requiredString(input.rootPath, "rootPath", MAX_PATH_LENGTH) };
    case "agent:turn-start":
      return compact({
        rootPath: requiredString(input.rootPath, "rootPath", MAX_PATH_LENGTH),
        sessionId: requiredOpaqueId(input.sessionId, "sessionId"),
        prompt: requiredString(input.prompt, "prompt", MAX_MESSAGE_LENGTH, { allowEmpty: true, preserveWhitespace: true }),
        model: optionalString(input.model, "model", 512),
        effort: optionalString(input.effort, "effort", 160),
        mode: optionalString(input.mode, "mode", 160),
        referenceEpoch: optionalOpaqueId(input.referenceEpoch, "referenceEpoch"),
        attachments: optionalReferences(input.attachments, "attachments"),
        contextReferences: optionalReferences(input.contextReferences, "contextReferences"),
        references: optionalDraftReferences(input.references, "references"),
        promptMentions: optionalPromptMentions(input.promptMentions, "promptMentions"),
      });
    case "agent:turn-steer":
      return {
        rootPath: requiredString(input.rootPath, "rootPath", MAX_PATH_LENGTH),
        sessionId: requiredOpaqueId(input.sessionId, "sessionId"),
        turnId: requiredOpaqueId(input.turnId, "turnId"),
        message: requiredString(input.message, "message", MAX_MESSAGE_LENGTH, { allowEmpty: true, preserveWhitespace: true }),
        referenceEpoch: optionalOpaqueId(input.referenceEpoch, "referenceEpoch"),
        references: optionalDraftReferences(input.references, "references"),
        promptMentions: optionalPromptMentions(input.promptMentions, "promptMentions"),
      };
    case "agent:turn-interrupt":
    case "agent:session-compact":
      return compact({
        rootPath: requiredString(input.rootPath, "rootPath", MAX_PATH_LENGTH),
        sessionId: requiredOpaqueId(input.sessionId, "sessionId"),
        turnId: channel === "agent:turn-interrupt" ? requiredOpaqueId(input.turnId, "turnId") : undefined,
      });
    case "agent:approval-resolve":
      return {
        rootPath: requiredString(input.rootPath, "rootPath", MAX_PATH_LENGTH),
        sessionId: requiredOpaqueId(input.sessionId, "sessionId"),
        turnId: requiredOpaqueId(input.turnId, "turnId"),
        requestId: requiredOpaqueId(input.requestId, "requestId"),
        decision: enumValue(input.decision, "decision", ["accept", "acceptForSession", "decline", "cancel"]),
      };
    case "agent:question-resolve":
      return compact({
        rootPath: requiredString(input.rootPath, "rootPath", MAX_PATH_LENGTH),
        sessionId: requiredOpaqueId(input.sessionId, "sessionId"),
        turnId: requiredOpaqueId(input.turnId, "turnId"),
        requestId: requiredOpaqueId(input.requestId, "requestId"),
        answer: optionalQuestionAnswer(input.answer, "answer"),
        answers: optionalAnswerMatrix(input.answers, "answers"),
        rejected: optionalBoolean(input.rejected, "rejected"),
      });
    default:
      throw new TypeError(`Unknown Agent IPC channel: ${String(channel)}`);
  }
}

export function assertAgentIpcResponse(channel, value) {
  switch (channel) {
    case "agent:providers-discover":
      return assertAgentInspection(value);
    case "agent:local-connections-discover":
      return sanitizeAgentLocalConnectionsSnapshot(value);
    case "agent:models-list":
      assertArray(value, "models").forEach(assertAgentModel);
      return value;
    case "agent:account-read":
      if (value !== null) assertRecord(value, "account state");
      return value;
    case "agent:session-create":
    case "agent:session-replay":
    case "agent:session-fork":
      return assertAgentSessionSnapshot(value);
    case "agent:session-resume":
      return value === null ? value : assertAgentSessionSnapshot(value);
    case "agent:sessions-list":
      return sanitizeAgentSessionsListResponse(value);
    case "agent:session-archive":
    case "agent:session-delete":
    case "agent:session-close":
    case "agent:reference-revoke":
    case "agent:turn-start":
    case "agent:turn-steer":
    case "agent:turn-interrupt":
    case "agent:session-compact":
    case "agent:approval-resolve":
    case "agent:question-resolve":
      assertRecord(value, `${channel} response`);
      return value;
    case "agent:reference-stage":
    case "agent:reference-resolve-workspace":
    case "agent:reference-pick-workspace":
      return assertArray(value, `${channel} response`)
        .map((entry, index) => sanitizeDraftReference(entry, `${channel}[${index}]`, false));
    default:
      throw new TypeError(`Unknown Agent IPC channel: ${String(channel)}`);
  }
}

function optionalPageSize(value, label) {
  if (value === undefined || value === null) return undefined;
  const normalized = nonNegativeInteger(value, label);
  if (normalized < 1 || normalized > 100) throw contractError(label, "must be between 1 and 100");
  return normalized;
}

function assertAgentSessionSnapshot(value) {
  const snapshot = assertRecord(value, "Agent session snapshot");
  assertAgentSessionMetadata(snapshot.session);
  assertArray(snapshot.providers ?? [], "Agent session providers").forEach(assertAgentInferenceProvider);
  assertArray(snapshot.models ?? [], "Agent session models").forEach(assertAgentModel);
  assertArray(snapshot.events, "Agent session events").forEach(assertAgentEventEnvelope);
  if (!Number.isSafeInteger(snapshot.firstAvailableSequence) || snapshot.firstAvailableSequence < 0) throw contractError("firstAvailableSequence", "must be a non-negative integer");
  if (!Number.isSafeInteger(snapshot.lastSequence) || snapshot.lastSequence < 0) throw contractError("lastSequence", "must be a non-negative integer");
  return value;
}

function assertAgentSessionMetadata(value) {
  const session = assertRecord(value, "Agent session");
  requiredOpaqueId(session.id, "Agent session.id");
  assertRuntimeId(session.runtimeId ?? session.provider, "Agent session.runtimeId");
  requiredString(session.workspaceRoot, "Agent session.workspaceRoot", MAX_PATH_LENGTH);
  requiredString(session.title, "Agent session.title", 512);
  return value;
}

function sanitizeAgentSessionsListResponse(value) {
  const response = assertRecord(value, "session list");
  const discovery = assertRecord(response.discovery, "session list.discovery");
  return {
    sessions: assertArray(response.sessions, "session list.sessions")
      .slice(0, 500)
      .map((session, index) => sanitizeAgentSessionListItem(session, `session list.sessions[${index}]`)),
    discovery: {
      runtimeId: optionalRuntimeId(discovery.runtimeId) ?? null,
      status: enumValue(discovery.status, "session list.discovery.status", [
        "not-requested", "unsupported", "partial", "complete", "failed",
      ]),
      nextCursor: optionalString(discovery.nextCursor, "session list.discovery.nextCursor", 1_024) ?? null,
      indexed: nonNegativeInteger(discovery.indexed, "session list.discovery.indexed"),
      warnings: safeWarnings(discovery.warnings, "session list.discovery.warnings"),
    },
    warnings: safeWarnings(response.warnings, "session list.warnings"),
  };
}

function sanitizeAgentSessionListItem(value, label) {
  const session = assertRecord(value, label);
  const runtimeId = assertRuntimeId(session.runtimeId ?? session.provider, `${label}.runtimeId`);
  const provider = assertRuntimeId(session.provider ?? runtimeId, `${label}.provider`);
  return compact({
    id: requiredOpaqueId(session.id, `${label}.id`),
    runtimeId,
    runtime: session.runtime == null ? undefined : sanitizeAgentRuntimeDescriptor(session.runtime),
    provider,
    providerSessionId: optionalOpaqueId(session.providerSessionId, `${label}.providerSessionId`, { nullable: true }) ?? null,
    workspaceRoot: requiredString(session.workspaceRoot, `${label}.workspaceRoot`, MAX_PATH_LENGTH),
    title: requiredString(session.title, `${label}.title`, 512),
    createdAt: isoTimestamp(session.createdAt, `${label}.createdAt`),
    updatedAt: isoTimestamp(session.updatedAt, `${label}.updatedAt`),
    terminalState: enumValue(session.terminalState, `${label}.terminalState`, [
      "idle", "running", "completed", "failed", "interrupted", "provider-exited",
    ]),
    selectedModel: optionalString(session.selectedModel, `${label}.selectedModel`, 512) ?? null,
    selectedEffort: optionalString(session.selectedEffort, `${label}.selectedEffort`, 160) ?? null,
    selectedMode: optionalString(session.selectedMode, `${label}.selectedMode`, 160) ?? null,
    lastSequence: nonNegativeInteger(session.lastSequence, `${label}.lastSequence`),
    archivedAt: session.archivedAt == null ? undefined : isoTimestamp(session.archivedAt, `${label}.archivedAt`),
    partial: optionalBoolean(session.partial, `${label}.partial`),
    origin: session.origin == null
      ? undefined
      : enumValue(session.origin, `${label}.origin`, ["puppyone", "native-discovery"]),
  });
}

function safeWarnings(value, label) {
  return assertArray(value, label).slice(0, 50)
    .map((entry, index) => requiredString(entry, `${label}[${index}]`, 4_000));
}

function isoTimestamp(value, label) {
  const input = requiredString(value, label, 64);
  const milliseconds = Date.parse(input);
  if (!Number.isFinite(milliseconds)) throw contractError(label, "must be an ISO timestamp");
  return new Date(milliseconds).toISOString();
}

function optionalReferences(value, label) {
  if (value === undefined || value === null) return undefined;
  const references = assertArray(value, label);
  if (references.length > MAX_REFERENCE_COUNT) throw contractError(label, `may contain at most ${MAX_REFERENCE_COUNT} entries`);
  return references.map((entry, index) => {
    const reference = assertRecord(entry, `${label}[${index}]`);
    return compact({
      path: requiredString(reference.path, `${label}[${index}].path`, MAX_PATH_LENGTH),
      name: optionalString(reference.name, `${label}[${index}].name`, 512),
    });
  });
}

function optionalDraftReferences(value, label) {
  if (value === undefined || value === null) return undefined;
  const references = assertArray(value, label);
  if (references.length > MAX_REFERENCE_COUNT) throw contractError(label, `may contain at most ${MAX_REFERENCE_COUNT} entries`);
  return references.map((entry, index) => sanitizeDraftReference(entry, `${label}[${index}]`, true));
}

function optionalPromptMentions(value, label) {
  if (value === undefined || value === null) return undefined;
  const mentions = assertArray(value, label);
  if (mentions.length > MAX_REFERENCE_COUNT) throw contractError(label, `may contain at most ${MAX_REFERENCE_COUNT} entries`);
  return mentions.map((entry, index) => {
    const mention = assertRecord(entry, `${label}[${index}]`);
    return {
      referenceId: requiredOpaqueId(mention.referenceId, `${label}[${index}].referenceId`),
      start: nonNegativeInteger(mention.start, `${label}[${index}].start`),
      end: nonNegativeInteger(mention.end, `${label}[${index}].end`),
    };
  });
}

function sanitizeDraftReference(value, label, requireReady) {
  const reference = assertRecord(value, label);
  const kind = enumValue(reference.kind, `${label}.kind`, ["workspace-entry", "staged-attachment"]);
  const status = enumValue(reference.status, `${label}.status`, ["resolving", "ready", "error"]);
  if (requireReady && status !== "ready") throw contractError(`${label}.status`, "must be ready before submission");
  const base = {
    id: requiredOpaqueId(reference.id, `${label}.id`),
    kind,
    displayName: requiredString(reference.displayName, `${label}.displayName`, 512),
    status,
  };
  if (kind === "workspace-entry") {
    const relativePath = normalizeAgentWorkspaceRelativePath(reference.relativePath);
    if (!relativePath) throw contractError(`${label}.relativePath`, "must remain workspace-relative");
    return {
      ...base,
      entryType: enumValue(reference.entryType, `${label}.entryType`, ["file", "directory"]),
      relativePath,
      ...(reference.mime === undefined ? {} : { mime: requiredString(reference.mime, `${label}.mime`, 160) }),
      ...(reference.size === undefined ? {} : { size: nonNegativeInteger(reference.size, `${label}.size`) }),
    };
  }
  return {
    ...base,
    token: requiredOpaqueId(reference.token, `${label}.token`),
    mime: requiredString(reference.mime, `${label}.mime`, 160),
    size: nonNegativeInteger(reference.size, `${label}.size`),
  };
}

function boundedStringArray(value, label, maximumEntries, maximumLength) {
  const entries = assertArray(value, label);
  if (entries.length === 0 || entries.length > maximumEntries) throw contractError(label, `must contain 1-${maximumEntries} entries`);
  return entries.map((entry, index) => requiredString(entry, `${label}[${index}]`, maximumLength));
}

function boundedOpaqueIdArray(value, label, maximumEntries) {
  const entries = assertArray(value, label);
  if (entries.length > maximumEntries) throw contractError(label, `may contain at most ${maximumEntries} entries`);
  return entries.map((entry, index) => requiredOpaqueId(entry, `${label}[${index}]`));
}

function optionalQuestionAnswer(value, label) {
  if (value === undefined) return undefined;
  if (value === null || typeof value === "string") return value === null ? null : boundedAnswer(value, label);
  if (!Array.isArray(value)) throw contractError(label, "must be text, an array, or null");
  if (value.length > 100) throw contractError(label, "contains too many entries");
  return value.map((entry, index) => (
    Array.isArray(entry)
      ? entry.slice(0, 100).map((item, itemIndex) => boundedAnswer(item, `${label}[${index}][${itemIndex}]`))
      : boundedAnswer(entry, `${label}[${index}]`)
  ));
}

function optionalAnswerMatrix(value, label) {
  if (value === undefined || value === null) return value;
  if (!Array.isArray(value) || value.length > 100) throw contractError(label, "must be a bounded array");
  return value.map((row, rowIndex) => {
    if (!Array.isArray(row) || row.length > 100) throw contractError(`${label}[${rowIndex}]`, "must be a bounded array");
    return row.map((entry, entryIndex) => boundedAnswer(entry, `${label}[${rowIndex}][${entryIndex}]`));
  });
}

function boundedAnswer(value, label) {
  return requiredString(value, label, 8_192, { allowEmpty: true, preserveWhitespace: true });
}
