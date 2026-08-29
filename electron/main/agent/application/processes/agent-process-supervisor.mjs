const DEFAULT_MAX_CONCURRENT_STARTS = 2;

/** A small fair semaphore for expensive native Agent process starts. */
export function createAgentProcessSupervisor({
  maxConcurrentStarts = DEFAULT_MAX_CONCURRENT_STARTS,
} = {}) {
  const limit = boundedLimit(maxConcurrentStarts);
  const queue = [];
  let inUse = 0;

  function runStart({ label = "agent-runtime", signal } = {}, operation) {
    if (typeof operation !== "function") {
      return Promise.reject(new TypeError("Agent process start requires an operation."));
    }
    if (signal?.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
      const entry = {
        label: boundedLabel(label),
        operation,
        resolve,
        reject,
        signal,
        onAbort: null,
      };
      entry.onAbort = () => {
        const index = queue.indexOf(entry);
        if (index < 0) return;
        queue.splice(index, 1);
        reject(abortError());
      };
      signal?.addEventListener("abort", entry.onAbort, { once: true });
      queue.push(entry);
      drain();
    });
  }

  function drain() {
    while (inUse < limit && queue.length > 0) {
      const entry = queue.shift();
      entry.signal?.removeEventListener("abort", entry.onAbort);
      if (entry.signal?.aborted) {
        entry.reject(abortError());
        continue;
      }
      inUse += 1;
      Promise.resolve()
        .then(entry.operation)
        .then(entry.resolve, entry.reject)
        .finally(() => {
          inUse -= 1;
          drain();
        });
    }
  }

  return {
    runStart,
    snapshot: () => Object.freeze({
      maxConcurrentStarts: limit,
      inUse,
      queued: queue.length,
      queuedLabels: queue.slice(0, 32).map((entry) => entry.label),
    }),
  };
}

function boundedLimit(value) {
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value, 8) : DEFAULT_MAX_CONCURRENT_STARTS;
}

function boundedLabel(value) {
  return typeof value === "string" ? value.trim().slice(0, 160) || "agent-runtime" : "agent-runtime";
}

function abortError() {
  const error = new Error("Agent process start was aborted.");
  error.name = "AbortError";
  return error;
}
