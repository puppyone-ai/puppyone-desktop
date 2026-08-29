import {
  DESKTOP_TELEMETRY_NOTICE_VERSION,
  isDesktopTelemetryLevel,
} from "../../../../shared/desktop-telemetry-contract.mjs";
import { createAtomicJsonFile } from "./atomic-json-file.mjs";

const PREFERENCE_VERSION = 1;

export function createTelemetryPreferenceStore({
  defaultLevel,
  filePath,
  fsModule,
}) {
  if (!isDesktopTelemetryLevel(defaultLevel)) {
    throw new TypeError("A valid default telemetry level is required.");
  }
  const file = createAtomicJsonFile({ filePath, fsModule });

  return Object.freeze({
    async read() {
      return normalizePreference(await file.read(), defaultLevel);
    },

    async write(preference) {
      const normalized = normalizePreference(preference, defaultLevel);
      await file.write(normalized);
      return normalized;
    },
  });
}

export function createDefaultTelemetryPreference(defaultLevel) {
  return Object.freeze({
    version: PREFERENCE_VERSION,
    level: defaultLevel,
    notice_seen_version: 0,
    updated_at: null,
  });
}

function normalizePreference(value, defaultLevel) {
  const fallback = createDefaultTelemetryPreference(defaultLevel);
  if (!value || value.version !== PREFERENCE_VERSION) return fallback;
  const level = isDesktopTelemetryLevel(value.level) ? value.level : defaultLevel;
  const noticeSeenVersion = Number.isSafeInteger(value.notice_seen_version)
    && value.notice_seen_version >= 0
    && value.notice_seen_version <= DESKTOP_TELEMETRY_NOTICE_VERSION
    ? value.notice_seen_version
    : 0;
  const updatedAt = typeof value.updated_at === "string" && Number.isFinite(Date.parse(value.updated_at))
    ? new Date(value.updated_at).toISOString()
    : null;
  return Object.freeze({
    version: PREFERENCE_VERSION,
    level,
    notice_seen_version: noticeSeenVersion,
    updated_at: updatedAt,
  });
}
