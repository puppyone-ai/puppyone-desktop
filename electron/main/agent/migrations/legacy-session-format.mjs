const LEGACY_RUNTIME_ID = "codex";
const RUNTIME_ID_PATTERN = /^[a-z][a-z0-9-]{1,39}$/;

/**
 * Session journal v1 predated runtime selection and therefore omitted a
 * runtime id. Keep that historical default at the persistence edge instead of
 * leaking a concrete runtime into the application service or domain model.
 */
export function resolvePersistedRuntimeId(record, requestedRuntimeId = null) {
  for (const value of [record?.runtimeId, record?.provider, requestedRuntimeId]) {
    if (typeof value === "string" && RUNTIME_ID_PATTERN.test(value)) return value;
  }
  return LEGACY_RUNTIME_ID;
}

export function migratedRuntimeDescriptor(record, runtimeId) {
  if (record?.runtime && typeof record.runtime === "object") return record.runtime;
  if (runtimeId === "opencode") {
    return { id: runtimeId, displayName: "OpenCode", kind: "harness" };
  }
  if (runtimeId === LEGACY_RUNTIME_ID) {
    return { id: runtimeId, displayName: "Codex CLI", kind: "direct-cli" };
  }
  return { id: runtimeId, displayName: humanizeRuntimeId(runtimeId), kind: "direct-cli" };
}

function humanizeRuntimeId(value) {
  return String(value).replace(/[-_.]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
