export const AGENT_REFERENCE_ERROR_CODES = Object.freeze({
  unauthorized: "REFERENCE_UNAUTHORIZED",
  unsupportedKind: "REFERENCE_KIND_UNSUPPORTED",
  missingRuntimeCapability: "REFERENCE_RUNTIME_CAPABILITY_MISSING",
  modelIncompatible: "REFERENCE_MODEL_INCOMPATIBLE",
  materializationFailed: "REFERENCE_MATERIALIZATION_FAILED",
  unverifiedRuntimeVersion: "REFERENCE_RUNTIME_VERSION_UNVERIFIED",
  limitExceeded: "REFERENCE_LIMIT_EXCEEDED",
  invalidInput: "REFERENCE_INPUT_INVALID",
});

export class AgentReferenceError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "AgentReferenceError";
    this.code = code;
  }
}

export function agentReferenceError(code, message, options) {
  return new AgentReferenceError(code, message, options);
}
