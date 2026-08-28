import { isDesktopTelemetryEvent } from "../domain/daily-active-event.mjs";
import { createAtomicJsonFile } from "./atomic-json-file.mjs";

const QUEUE_VERSION = 1;

export function createTelemetryQueueStore({ filePath, fsModule }) {
  const file = createAtomicJsonFile({ filePath, fsModule });

  return Object.freeze({
    async read() {
      return normalizeQueue(await file.read());
    },

    async write(queue) {
      const normalized = normalizeQueue(queue);
      await file.write(normalized);
      return normalized;
    },

    async clear() {
      await file.remove();
      return createEmptyTelemetryQueue();
    },
  });
}

export function createEmptyTelemetryQueue() {
  return Object.freeze({
    version: QUEUE_VERSION,
    last_enqueued_utc_day: null,
    events: Object.freeze([]),
  });
}

function normalizeQueue(value) {
  if (!value || value.version !== QUEUE_VERSION) return createEmptyTelemetryQueue();
  const events = Array.isArray(value.events)
    ? value.events.filter(isDesktopTelemetryEvent).slice(-32)
    : [];
  const lastEnqueuedUtcDay = /^\d{4}-\d{2}-\d{2}$/.test(value.last_enqueued_utc_day ?? "")
    ? value.last_enqueued_utc_day
    : null;
  return Object.freeze({
    version: QUEUE_VERSION,
    last_enqueued_utc_day: lastEnqueuedUtcDay,
    events: Object.freeze(events),
  });
}
