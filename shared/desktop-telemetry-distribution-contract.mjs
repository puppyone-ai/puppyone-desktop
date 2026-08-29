// Keep the Stable ingestion endpoint pinned in source, like the updater feed.
// Development, unpackaged, and non-Stable builds remain ineligible even when
// this first-party endpoint is configured.
export const DESKTOP_STABLE_TELEMETRY_INGEST_URL =
  "https://telemetry.puppyone.ai/v1/desktop/events";
