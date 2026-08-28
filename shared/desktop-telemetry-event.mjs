import {
  DESKTOP_TELEMETRY_DAILY_ACTIVE_EVENT,
  DESKTOP_TELEMETRY_NOTICE_VERSION,
  DESKTOP_TELEMETRY_SCHEMA_VERSION,
} from "./desktop-telemetry-contract.mjs";

const EVENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ANONYMOUS_ID_PATTERN = /^m1_[A-Za-z0-9_-]{32,64}$/;
const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,79}$/;
const TOKEN_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/i;

export function createDesktopDailyActiveEvent({
  activityDay,
  anonymousId,
  appVersion,
  architecture,
  eventId,
  osMajor,
  platform,
}) {
  const event = {
    schema_version: DESKTOP_TELEMETRY_SCHEMA_VERSION,
    event_id: requireMatch(eventId, EVENT_ID_PATTERN, "event ID"),
    event: DESKTOP_TELEMETRY_DAILY_ACTIVE_EVENT,
    activity_day: normalizeActivityDay(activityDay),
    anonymous_id: requireMatch(anonymousId, ANONYMOUS_ID_PATTERN, "anonymous ID"),
    properties: {
      app_version: requireMatch(appVersion, VERSION_PATTERN, "application version"),
      platform: requireMatch(platform, TOKEN_PATTERN, "platform"),
      architecture: requireMatch(architecture, TOKEN_PATTERN, "architecture"),
      os_major: normalizeOsMajor(osMajor),
      notice_version: DESKTOP_TELEMETRY_NOTICE_VERSION,
    },
  };
  return deepFreeze(event);
}

export function isDesktopTelemetryEvent(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (Object.keys(value).sort().join(",") !== [
    "activity_day",
    "anonymous_id",
    "event",
    "event_id",
    "properties",
    "schema_version",
  ].sort().join(",")) return false;
  if (value.schema_version !== DESKTOP_TELEMETRY_SCHEMA_VERSION) return false;
  if (value.event !== DESKTOP_TELEMETRY_DAILY_ACTIVE_EVENT) return false;
  try {
    const normalized = createDesktopDailyActiveEvent({
      activityDay: value.activity_day,
      anonymousId: value.anonymous_id,
      appVersion: value.properties?.app_version,
      architecture: value.properties?.architecture,
      eventId: value.event_id,
      osMajor: value.properties?.os_major,
      platform: value.properties?.platform,
    });
    return JSON.stringify(normalized) === JSON.stringify(value);
  } catch {
    return false;
  }
}

export function normalizeDesktopOsMajor(value) {
  return normalizeOsMajor(value);
}

function normalizeActivityDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError("A valid UTC telemetry activity day is required.");
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new TypeError("A valid UTC telemetry activity day is required.");
  }
  return value;
}

function normalizeOsMajor(value) {
  const match = String(value ?? "").trim().match(/^(\d{1,3})(?:\D|$)/);
  if (!match) return "unknown";
  return String(Number(match[1]));
}

function requireMatch(value, pattern, label) {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new TypeError(`A valid ${label} is required.`);
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
