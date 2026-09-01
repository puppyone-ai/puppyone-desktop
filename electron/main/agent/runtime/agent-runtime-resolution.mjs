import { redactSecretText } from "../agent-events.mjs";

const TRANSIENT_CODES = new Set([
  "AUTHENTICATION_PROBE_FAILED",
  "AUTHENTICATION_PROBE_CRASHED",
  "AUTHENTICATION_PROBE_TIMED_OUT",
  "AUTHENTICATION_STATUS_UNKNOWN",
  "RUNTIME_DISCOVERY_FAILED",
  "RUNTIME_INSPECTION_FAILED",
  "PROTOCOL_PROBE_FAILED",
]);

export class AgentRuntimeResolutionError extends Error {
  constructor({ runtimeId, operation, stage = "inventory", readiness, message = null }) {
    super(redactSecretText(message || readiness?.message || "Agent runtime is not ready."));
    this.name = "AgentRuntimeResolutionError";
    this.runtimeId = runtimeId;
    this.operation = operation;
    this.stage = stage;
    this.code = readiness?.code || "RUNTIME_DISCOVERY_FAILED";
    this.status = readiness?.status || "error";
    this.retryable = TRANSIENT_CODES.has(this.code);
    this.actions = Object.freeze(actionsFor(this.code));
  }
}

export function isAgentRuntimeResolutionError(error) {
  return error instanceof AgentRuntimeResolutionError;
}

function actionsFor(code) {
  if (code === "AUTHENTICATION_REQUIRED" || code === "AUTHENTICATION_EXPIRED") {
    return ["sign-in", "refresh"];
  }
  if (code === "RUNTIME_NOT_INSTALLED") return ["learn-more", "refresh"];
  if (code === "RUNTIME_VERSION_UNSUPPORTED" || code === "RUNTIME_VERSION_UNVERIFIED") {
    return ["update", "refresh"];
  }
  return ["refresh"];
}
