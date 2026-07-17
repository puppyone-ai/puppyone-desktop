import {
  AGENT_RUNTIME_CAPABILITIES,
  REQUIRED_AGENT_RUNTIME_METHODS,
  assertAgentInspection,
  assertAgentRuntimeCapabilities,
  normalizeCapabilitySnapshot,
} from "../../../../shared/agent-contract/schema.mjs";

export { AGENT_RUNTIME_CAPABILITIES, REQUIRED_AGENT_RUNTIME_METHODS, normalizeCapabilitySnapshot };

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
