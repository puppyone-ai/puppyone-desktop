import { DESKTOP_TELEMETRY_SCHEMA_VERSION } from "../../../../shared/desktop-telemetry-contract.mjs";
import { isDesktopTelemetryEvent } from "../domain/daily-active-event.mjs";

export function createTelemetryHttpTransport({
  endpoint,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  timeoutMs = 10_000,
}) {
  const normalizedEndpoint = normalizeTelemetryEndpoint(endpoint);
  if (typeof fetchImpl !== "function") throw new TypeError("A telemetry fetch implementation is required.");

  return Object.freeze({
    async send(events) {
      if (!Array.isArray(events) || events.length === 0 || !events.every(isDesktopTelemetryEvent)) {
        throw new TypeError("A non-empty batch of valid telemetry events is required.");
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      timeout.unref?.();
      let response;
      try {
        response = await fetchImpl(normalizedEndpoint, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "X-PuppyOne-Telemetry-Schema": String(DESKTOP_TELEMETRY_SCHEMA_VERSION),
          },
          body: JSON.stringify({
            schema_version: DESKTOP_TELEMETRY_SCHEMA_VERSION,
            sent_at: now().toISOString(),
            events,
          }),
          credentials: "omit",
          redirect: "error",
          signal: controller.signal,
        });
      } catch (cause) {
        const error = new Error("Desktop telemetry transport is unavailable.", { cause });
        error.retryable = true;
        throw error;
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        const error = new Error(`Desktop telemetry transport returned HTTP ${response.status}.`);
        error.status = response.status;
        error.retryable = response.status === 408
          || response.status === 425
          || response.status === 429
          || response.status >= 500;
        throw error;
      }
      return { acceptedEventIds: events.map((event) => event.event_id) };
    },
  });
}

export function normalizeTelemetryEndpoint(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("A valid telemetry endpoint is required.");
  }
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.search
    || url.hash
  ) {
    throw new TypeError("The telemetry endpoint must be an HTTPS URL without credentials, query, or fragment.");
  }
  return url.href;
}
