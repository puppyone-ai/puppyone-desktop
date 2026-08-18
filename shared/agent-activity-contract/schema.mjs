import {
  AGENT_ACTIVITY_LIMITS,
  AGENT_ACTIVITY_SCHEMA_VERSION,
  isAgentActivityOperation,
  isAgentActivityPathConfidence,
  isAgentActivityPhase,
  isAgentActivityTargetAccess,
} from "./constants.mjs";

export function parseAgentActivityEvent(value) {
  if (!isRecord(value) || value.schemaVersion !== AGENT_ACTIVITY_SCHEMA_VERSION) return null;
  if (!isBoundedId(value.eventId, 128) || !isBoundedId(value.activityId, 128)) return null;
  if (!isProviderId(value.providerId) || !isBoundedId(value.terminalSessionId, 128)) return null;
  if (!isAgentActivityPhase(value.phase) || !isAgentActivityOperation(value.operation)) return null;
  if (!Number.isFinite(value.occurredAt) || value.occurredAt < 0) return null;
  if (!Array.isArray(value.targets) || value.targets.length > AGENT_ACTIVITY_LIMITS.targetsPerActivity) {
    return null;
  }
  const targets = value.targets.map(parsePublicTarget);
  if (targets.some((target) => !target)) return null;
  return Object.freeze({
    schemaVersion: AGENT_ACTIVITY_SCHEMA_VERSION,
    eventId: value.eventId,
    activityId: value.activityId,
    providerId: value.providerId,
    terminalSessionId: value.terminalSessionId,
    phase: value.phase,
    operation: value.operation,
    targets: Object.freeze(targets),
    occurredAt: value.occurredAt,
  });
}

export function parseAgentActivitySnapshot(value) {
  if (!isRecord(value) || value.schemaVersion !== AGENT_ACTIVITY_SCHEMA_VERSION) return null;
  if (!Array.isArray(value.activities) || value.activities.length > AGENT_ACTIVITY_LIMITS.activeClaimsPerWindow) {
    return null;
  }
  const activities = value.activities.map(parseAgentActivityEvent);
  if (activities.some((activity) => !activity || activity.phase !== "started")) return null;
  return Object.freeze({
    schemaVersion: AGENT_ACTIVITY_SCHEMA_VERSION,
    activities: Object.freeze(activities),
  });
}

function parsePublicTarget(value) {
  if (!isRecord(value)) return null;
  if (!isWorkspaceRelativePath(value.workspaceRelativePath)) return null;
  if (!isAgentActivityTargetAccess(value.access)) return null;
  if (!isAgentActivityPathConfidence(value.confidence)) return null;
  return Object.freeze({
    workspaceRelativePath: value.workspaceRelativePath,
    access: value.access,
    confidence: value.confidence,
  });
}

function isWorkspaceRelativePath(value) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= AGENT_ACTIVITY_LIMITS.pathLength
    && !value.startsWith("/")
    && !value.startsWith("\\")
    && !/^[A-Za-z]:[\\/]/u.test(value)
    && !/(?:^|\/)\.\.(?:\/|$)/u.test(value.replaceAll("\\", "/"))
    && !/[\0-\x1f\x7f]/u.test(value);
}

function isProviderId(value) {
  return typeof value === "string"
    && value.length <= AGENT_ACTIVITY_LIMITS.providerIdLength
    && /^[a-z][a-z0-9-]*$/u.test(value);
}

function isBoundedId(value, maxLength) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maxLength
    && !/[\0\r\n]/u.test(value);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
