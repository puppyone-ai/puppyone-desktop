import type { AgentControllerState } from "./agent-controller-state";

export const AGENT_RUNTIME_DISCOVERY_CACHE_TTL_MS = 5 * 60_000;

/** Keeps presentation remounts from probing local Agent installations again. */
export function hasFreshAgentRuntimeInspection(
  state: AgentControllerState,
  inspectedAt: number,
  now = Date.now(),
) {
  if (!state.initialized || !state.inspection || state.phase === "failed" || state.phase === "runtime-exited") return false;
  if (state.session) return true;
  const inspectedRuntimeId = state.inspection.selectedRuntimeId
    || state.inspection.runtime?.id
    || state.inspection.readiness.runtimeId
    || state.inspection.readiness.provider
    || null;
  return inspectedRuntimeId === state.selectedRuntimeId
    && inspectedAt > 0
    && now - inspectedAt < AGENT_RUNTIME_DISCOVERY_CACHE_TTL_MS;
}
