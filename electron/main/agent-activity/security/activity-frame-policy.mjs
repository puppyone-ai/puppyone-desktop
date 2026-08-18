import { AGENT_ACTIVITY_LIMITS, AGENT_ACTIVITY_SCHEMA_VERSION } from "../../../../shared/agent-activity-contract/constants.mjs";

export function parseHookIngestEnvelope(value) {
  if (!isRecord(value) || value.schemaVersion !== AGENT_ACTIVITY_SCHEMA_VERSION) return null;
  if (!isIdentifier(value.terminalSessionId, 128)) return null;
  if (!isIdentifier(value.token, 128)) return null;
  if (typeof value.providerId !== "string" || !/^[a-z][a-z0-9-]{0,39}$/u.test(value.providerId)) {
    return null;
  }
  if (!isProjectedPayload(value.payload)) return null;
  return Object.freeze({
    schemaVersion: AGENT_ACTIVITY_SCHEMA_VERSION,
    terminalSessionId: value.terminalSessionId,
    providerId: value.providerId,
    token: value.token,
    payload: value.payload,
  });
}

function isProjectedPayload(value) {
  if (!isRecord(value)) return false;
  if (!isIdentifier(value.eventName, 96) || !isIdentifier(value.toolCallId, 160)) return false;
  if (!isIdentifier(value.toolName, AGENT_ACTIVITY_LIMITS.stringLength)) return false;
  if (!isIdentifier(value.cwd, AGENT_ACTIVITY_LIMITS.pathLength)) return false;
  if (value.sessionId !== null && !isIdentifier(value.sessionId, 160)) return false;
  if (value.turnId !== null && !isIdentifier(value.turnId, 160)) return false;
  if (!isRecord(value.input)) return false;
  const entries = Object.entries(value.input);
  return entries.length <= 16 && entries.every(([key, item]) => (
    /^[a-z][a-z0-9_]{0,63}$/u.test(key)
    && (
      isBoundedPath(item)
      || (Array.isArray(item)
        && item.length <= AGENT_ACTIVITY_LIMITS.targetsPerActivity
        && item.every(isBoundedPath))
    )
  ));
}

function isBoundedPath(value) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= AGENT_ACTIVITY_LIMITS.pathLength
    && !/[\0-\x1f\x7f]/u.test(value);
}

function isIdentifier(value, maxLength) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maxLength
    && !/[\0\r\n]/u.test(value);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
