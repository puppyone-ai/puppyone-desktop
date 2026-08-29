import { createD1TelemetryRepository } from "./d1-telemetry-repository.mjs";
import {
  parseDesktopTelemetryRequest,
  TelemetryRequestError,
} from "./ingest-contract.mjs";

const INGEST_PATH = "/v1/desktop/events";
const HEALTH_PATH = "/healthz";

export function createDesktopTelemetryWorker({
  now = () => new Date(),
  repositoryFactory = createD1TelemetryRepository,
} = {}) {
  return Object.freeze({
    async fetch(request, env) {
      const url = new URL(request.url);
      if (url.pathname === HEALTH_PATH && request.method === "GET") {
        return jsonResponse({ status: "ok", mode: resolveMode(env.TELEMETRY_MODE) }, 200);
      }
      if (url.pathname !== INGEST_PATH) return jsonResponse({ error: "not_found" }, 404);
      if (request.method !== "POST") {
        return jsonResponse({ error: "method_not_allowed" }, 405, { Allow: "POST" });
      }

      const mode = resolveMode(env.TELEMETRY_MODE);
      if (mode === "paused") {
        return jsonResponse({ error: "temporarily_unavailable" }, 503, { "Retry-After": "3600" });
      }

      try {
        const envelope = await parseDesktopTelemetryRequest(request, { now });
        if (mode === "discard") {
          return jsonResponse({ accepted_event_ids: envelope.events.map((event) => event.event_id) }, 202);
        }
        if (!env.INGEST_RATE_LIMITER || typeof env.INGEST_RATE_LIMITER.limit !== "function") {
          return jsonResponse({ error: "service_misconfigured" }, 503, { "Retry-After": "3600" });
        }
        if (!env.DB) {
          return jsonResponse({ error: "service_misconfigured" }, 503, { "Retry-After": "3600" });
        }

        const anonymousIds = [...new Set(envelope.events.map((event) => event.anonymous_id))];
        const limits = await Promise.all(anonymousIds.map((anonymousId) => (
          env.INGEST_RATE_LIMITER.limit({ key: anonymousId })
        )));
        if (limits.some((result) => !result?.success)) {
          return jsonResponse({ error: "rate_limited" }, 429, { "Retry-After": "60" });
        }

        const repository = repositoryFactory({ db: env.DB });
        const result = await repository.ingest(envelope.events, now());
        return jsonResponse({ accepted_event_ids: result.acceptedEventIds }, 202);
      } catch (error) {
        if (error instanceof TelemetryRequestError) {
          return jsonResponse({ error: error.code }, error.status);
        }
        return jsonResponse({ error: "temporarily_unavailable" }, 503, { "Retry-After": "60" });
      }
    },

    async scheduled(controller, env) {
      if (!env.DB) throw new Error("The telemetry D1 binding is missing.");
      const repository = repositoryFactory({ db: env.DB });
      await repository.rollupAndPrune(new Date(controller.scheduledTime));
    },
  });
}

function resolveMode(value) {
  return value === "accept" || value === "discard" ? value : "paused";
}

function jsonResponse(payload, status, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}
