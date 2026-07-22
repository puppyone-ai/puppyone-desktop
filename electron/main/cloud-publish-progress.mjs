import { deriveCloudInitializationState } from "./cloud-initialization/state-derivation.mjs";

/** Observational progress channel. Listener failures never affect the durable saga. */
export function createCloudPublishProgressChannel({ rootPath, now, onProgress = null }) {
  const listeners = new Set(typeof onProgress === "function" ? [onProgress] : []);
  let lastProgress = null;

  function add(listener) {
    if (typeof listener !== "function") return;
    listeners.add(listener);
    if (lastProgress) safelyReport(listener, lastProgress);
  }

  function report(stage, record = null) {
    const progress = {
      rootPath,
      operationId: record?.operation_id ?? null,
      stage,
      state: record ? deriveCloudInitializationState(record) : null,
      updatedAt: new Date(now()).toISOString(),
    };
    lastProgress = progress;
    for (const listener of listeners) safelyReport(listener, progress);
  }

  return { add, report };
}

function safelyReport(listener, progress) {
  try {
    listener(progress);
  } catch {
    // Renderer progress is observational and must never affect the durable saga.
  }
}
