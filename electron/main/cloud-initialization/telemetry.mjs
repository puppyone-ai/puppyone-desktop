const ALLOWED_FIELDS = new Set([
  "operation_id",
  "attempt_id",
  "project_id",
  "commit_oid",
  "error_code",
  "outcome",
  "duration_ms",
  "attempt_count",
]);

export function createCloudInitializationTelemetry({ logger = {}, now = () => Date.now() } = {}) {
  function record(name, fields = {}) {
    const safe = {};
    for (const [key, value] of Object.entries(fields)) {
      if (!ALLOWED_FIELDS.has(key) || value == null) continue;
      safe[key] = key === "commit_oid" ? String(value).slice(0, 12) : value;
    }
    logger.info?.("puppyone.cloud_initialization", {
      event: name,
      occurred_at: new Date(now()).toISOString(),
      ...safe,
    });
  }
  return { record };
}
