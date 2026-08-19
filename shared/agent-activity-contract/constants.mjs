export const AGENT_ACTIVITY_SCHEMA_VERSION = 1;

export const AGENT_ACTIVITY_PHASES = Object.freeze([
  "started",
  "completed",
  "failed",
  "cancelled",
]);

export const AGENT_ACTIVITY_OPERATIONS = Object.freeze([
  "file.read",
  "file.search",
  "file.write",
  "file.delete",
  "file.move",
  "command",
  "subagent",
  "tool",
]);

export const AGENT_ACTIVITY_TARGET_ACCESS = Object.freeze([
  "read",
  "search",
  "write",
  "delete",
  "move-from",
  "move-to",
]);

export const AGENT_ACTIVITY_PATH_CONFIDENCE = Object.freeze(["exact", "inferred"]);

export const AGENT_ACTIVITY_LIMITS = Object.freeze({
  frameBytes: 64 * 1024,
  pathLength: 4_096,
  providerIdLength: 40,
  stringLength: 512,
  targetsPerActivity: 32,
  activeClaimsPerWindow: 256,
  activeClaimLeaseMs: 2 * 60 * 1000,
  completedLingerMs: 4_000,
});

export function isAgentActivityPhase(value) {
  return AGENT_ACTIVITY_PHASES.includes(value);
}

export function isAgentActivityOperation(value) {
  return AGENT_ACTIVITY_OPERATIONS.includes(value);
}

export function isAgentActivityTargetAccess(value) {
  return AGENT_ACTIVITY_TARGET_ACCESS.includes(value);
}

export function isAgentActivityPathConfidence(value) {
  return AGENT_ACTIVITY_PATH_CONFIDENCE.includes(value);
}
