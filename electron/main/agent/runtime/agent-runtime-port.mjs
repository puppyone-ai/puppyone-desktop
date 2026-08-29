import {
  AGENT_RUNTIME_CAPABILITIES,
  REQUIRED_AGENT_RUNTIME_METHODS,
  assertAgentInspection,
  assertAgentRuntimeCapabilities,
  normalizeCapabilitySnapshot,
} from "../../../../shared/agent-contract/schema.mjs";

export { AGENT_RUNTIME_CAPABILITIES, REQUIRED_AGENT_RUNTIME_METHODS, normalizeCapabilitySnapshot };

/**
 * A persisted native conversation points at a provider thread that no longer
 * exists. This is a recoverable cache miss, not a runtime-readiness failure.
 */
export class AgentProviderSessionUnavailableError extends Error {
  constructor(message = "The native Agent session is no longer available.") {
    super(message);
    this.name = "AgentProviderSessionUnavailableError";
    this.code = "AGENT_PROVIDER_SESSION_UNAVAILABLE";
  }
}

export function isAgentProviderSessionUnavailableError(error) {
  return error instanceof AgentProviderSessionUnavailableError
    || error?.code === "AGENT_PROVIDER_SESSION_UNAVAILABLE";
}

export function assertAgentRuntimePort(adapter, runtimeId = "unknown") {
  if (!adapter || typeof adapter !== "object") throw new TypeError(`Agent runtime ${runtimeId} did not create an adapter.`);
  for (const method of REQUIRED_AGENT_RUNTIME_METHODS) {
    if (typeof adapter[method] !== "function") throw new TypeError(`Agent runtime ${runtimeId} is missing ${method}().`);
  }
  return adapter;
}

export function assertAgentRuntimeInspection(adapter, inspection, runtimeId = "unknown") {
  assertAgentInspection(inspection);
  const capabilities = assertAgentRuntimeCapabilities(adapter, inspection.capabilities, runtimeId);
  return { ...inspection, capabilities };
}
