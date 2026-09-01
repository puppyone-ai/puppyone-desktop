import { AGENT_EVENT_TYPES } from "./constants.mjs";
import {
  assertRecord,
  assertRuntimeId,
  contractError,
  isOpaqueId,
  nonNegativeInteger,
  optionalOpaqueId,
  positiveInteger,
  requiredString,
} from "./validation.mjs";
import { normalizeAgentWorkspaceRelativePath } from "./reference-identity.mjs";

const EVENT_TYPE_SET = new Set(AGENT_EVENT_TYPES);

export function assertAgentEventEnvelope(value) {
  const event = assertRecord(value, "AgentEvent");
  if (event.schemaVersion !== 1) throw contractError("AgentEvent.schemaVersion", "must equal 1");
  positiveInteger(event.sequence, "AgentEvent.sequence");
  requiredString(event.sessionId, "AgentEvent.sessionId", 256);
  assertRuntimeId(event.runtimeId ?? event.provider, "AgentEvent.runtimeId");
  assertRuntimeId(event.provider, "AgentEvent.provider");
  optionalOpaqueId(event.providerSessionId, "AgentEvent.providerSessionId", { nullable: true });
  optionalOpaqueId(event.turnId, "AgentEvent.turnId", { nullable: true });
  optionalOpaqueId(event.itemId, "AgentEvent.itemId", { nullable: true });
  requiredString(event.emittedAt, "AgentEvent.emittedAt", 64);
  if (!EVENT_TYPE_SET.has(event.type)) throw contractError("AgentEvent.type", "is not supported");
  const payload = assertRecord(event.payload, "AgentEvent.payload");
  if ((event.type === "approval.requested" || event.type === "approval.resolved" || event.type === "question.requested" || event.type === "question.resolved") && !isOpaqueId(payload.requestId)) {
    throw contractError(`AgentEvent(${event.type}).payload.requestId`, "is required");
  }
  if (event.type === "question.requested" && !Array.isArray(payload.questions)) {
    throw contractError("AgentEvent(question.requested).payload.questions", "must be an array");
  }
  if (event.type === "turn.started" && payload.referenceDisplays !== undefined) {
    assertReferenceDisplays(payload.referenceDisplays);
  }
  if (event.type === "turn.started" && payload.promptMentions !== undefined) {
    assertPromptMentions(payload.promptMentions, payload.prompt);
  }
  return value;
}

function assertPromptMentions(value, prompt) {
  if (!Array.isArray(value) || value.length > 32) {
    throw contractError("AgentEvent(turn.started).payload.promptMentions", "must contain at most 32 entries");
  }
  const text = typeof prompt === "string" ? prompt : "";
  let boundary = 0;
  value.forEach((entry, index) => {
    const label = `AgentEvent(turn.started).payload.promptMentions[${index}]`;
    const mention = assertRecord(entry, label);
    if (!isOpaqueId(mention.referenceId)) throw contractError(`${label}.referenceId`, "is invalid");
    const start = nonNegativeInteger(mention.start, `${label}.start`);
    const end = nonNegativeInteger(mention.end, `${label}.end`);
    if (start < boundary || end <= start || end > text.length) throw contractError(label, "has an invalid or overlapping range");
    boundary = end;
  });
}

function assertReferenceDisplays(value) {
  if (!Array.isArray(value) || value.length > 32) {
    throw contractError("AgentEvent(turn.started).payload.referenceDisplays", "must contain at most 32 entries");
  }
  const allowedKeys = new Set(["id", "kind", "displayName", "relativePath", "mime", "size"]);
  value.forEach((entry, index) => {
    const label = `AgentEvent(turn.started).payload.referenceDisplays[${index}]`;
    const reference = assertRecord(entry, label);
    for (const key of Object.keys(reference)) {
      if (!allowedKeys.has(key)) throw contractError(`${label}.${key}`, "is not renderer-safe reference metadata");
    }
    if (!isOpaqueId(reference.id)) throw contractError(`${label}.id`, "is invalid");
    if (!["workspace-file", "workspace-directory", "attachment"].includes(reference.kind)) {
      throw contractError(`${label}.kind`, "is invalid");
    }
    requiredString(reference.displayName, `${label}.displayName`, 512);
    if (reference.relativePath !== undefined) {
      const relativePath = requiredString(reference.relativePath, `${label}.relativePath`, 4_096);
      if (!normalizeAgentWorkspaceRelativePath(relativePath)) {
        throw contractError(`${label}.relativePath`, "must remain workspace-relative");
      }
    }
    if (reference.mime !== undefined) requiredString(reference.mime, `${label}.mime`, 200);
    if (reference.size !== undefined) {
      const size = nonNegativeInteger(reference.size, `${label}.size`);
      if (size > 25 * 1024 * 1024) throw contractError(`${label}.size`, "exceeds the reference display limit");
    }
  });
}
