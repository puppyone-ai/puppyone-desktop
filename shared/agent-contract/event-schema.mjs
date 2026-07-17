import { AGENT_EVENT_TYPES } from "./constants.mjs";
import {
  assertRecord,
  assertRuntimeId,
  contractError,
  isOpaqueId,
  optionalOpaqueId,
  positiveInteger,
  requiredString,
} from "./validation.mjs";

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
  return value;
}
