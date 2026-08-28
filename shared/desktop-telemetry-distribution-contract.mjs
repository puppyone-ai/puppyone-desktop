// Keep the Stable ingestion endpoint pinned in source, like the updater feed.
// It intentionally remains null until the first-party ingestion service has
// its schema validation, IP scrubbing, retention, and rate limiting deployed.
export const DESKTOP_STABLE_TELEMETRY_INGEST_URL = null;
