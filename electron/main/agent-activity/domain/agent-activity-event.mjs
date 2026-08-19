import {
  AGENT_ACTIVITY_LIMITS,
  AGENT_ACTIVITY_SCHEMA_VERSION,
  isAgentActivityOperation,
  isAgentActivityPathConfidence,
  isAgentActivityPhase,
  isAgentActivityTargetAccess,
} from "../../../../shared/agent-activity-contract/constants.mjs";

export function parseNormalizedAgentActivitySourceEvent(value) {
  if (!isRecord(value) || value.schemaVersion !== AGENT_ACTIVITY_SCHEMA_VERSION) return null;
  if (value.sourceSurface !== "terminal" || !isProviderId(value.providerId)) return null;
  if (!isIdentifier(value.terminalSessionId) || !isNullableIdentifier(value.sourceSessionId)) return null;
  if (!isNullableIdentifier(value.nativeTurnId) || !isIdentifier(value.nativeToolCallId)) return null;
  if (!isBoundedString(value.nativeToolName, AGENT_ACTIVITY_LIMITS.stringLength)) return null;
  if (!isAgentActivityPhase(value.phase) || !isAgentActivityOperation(value.operation)) return null;
  if (!isBoundedString(value.cwd, AGENT_ACTIVITY_LIMITS.pathLength)) return null;
  if (!Array.isArray(value.targets) || value.targets.length > AGENT_ACTIVITY_LIMITS.targetsPerActivity) {
    return null;
  }
  const targets = value.targets.map(parseTarget);
  if (targets.some((target) => !target)) return null;
  if (!Number.isFinite(value.occurredAt) || value.occurredAt < 0) return null;
  return Object.freeze({
    ...value,
    targets: Object.freeze(targets),
  });
}

function parseTarget(value) {
  if (!isRecord(value) || value.kind !== "file") return null;
  if (!isBoundedString(value.path, AGENT_ACTIVITY_LIMITS.pathLength)) return null;
  if (!isAgentActivityTargetAccess(value.access)) return null;
  if (!isAgentActivityPathConfidence(value.confidence)) return null;
  return Object.freeze({
    kind: "file",
    path: value.path,
    access: value.access,
    confidence: value.confidence,
  });
}

function isProviderId(value) {
  return typeof value === "string" && /^[a-z][a-z0-9-]{0,39}$/u.test(value);
}

function isIdentifier(value) {
  return isBoundedString(value, 160) && !/[\0\r\n]/u.test(value);
}

function isNullableIdentifier(value) {
  return value === null || isIdentifier(value);
}

function isBoundedString(value, maxLength) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
