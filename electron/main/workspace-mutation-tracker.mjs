import path from "node:path";

/**
 * Tracks main-owned workspace writes and a monotonic content epoch. The epoch
 * is an optimistic guard for autonomous readers; it is deliberately separate
 * from filesystem watcher debounce and Git metadata invalidation.
 */
export function createWorkspaceMutationTracker() {
  const states = new Map();

  function stateFor(rootPath) {
    const root = path.resolve(rootPath);
    let state = states.get(root);
    if (!state) {
      state = { epoch: 0, pending: 0, idleWaiters: new Set() };
      states.set(root, state);
    }
    return state;
  }

  async function run(rootPath, operation) {
    if (typeof operation !== "function") {
      throw new TypeError("A workspace mutation callback is required.");
    }
    const state = stateFor(rootPath);
    state.pending += 1;
    try {
      return await operation();
    } finally {
      // A failed mutator may still have changed bytes before rejecting. Epoch
      // invalidation is therefore attempt-based and deliberately conservative.
      state.epoch += 1;
      state.pending -= 1;
      if (state.pending === 0) {
        for (const resolve of state.idleWaiters) resolve();
        state.idleWaiters.clear();
      }
    }
  }

  function noteActivity(rootPath) {
    const state = stateFor(rootPath);
    state.epoch += 1;
    return state.epoch;
  }

  async function whenIdle(rootPath, { signal } = {}) {
    const state = stateFor(rootPath);
    if (state.pending === 0) return;
    await new Promise((resolve, reject) => {
      const onAbort = () => {
        cleanup();
        const error = new Error("Workspace durability wait was cancelled.");
        error.name = "AbortError";
        error.code = "ABORT_ERR";
        reject(error);
      };
      const onIdle = () => {
        cleanup();
        resolve();
      };
      const cleanup = () => {
        state.idleWaiters.delete(onIdle);
        signal?.removeEventListener("abort", onAbort);
      };
      if (signal?.aborted) {
        onAbort();
        return;
      }
      state.idleWaiters.add(onIdle);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  function capture(rootPath) {
    const state = stateFor(rootPath);
    return Object.freeze({ epoch: state.epoch, idle: state.pending === 0 });
  }

  function isCurrentAndIdle(rootPath, epoch) {
    const state = stateFor(rootPath);
    return state.pending === 0 && state.epoch === epoch;
  }

  function release(rootPath) {
    const root = path.resolve(rootPath);
    const state = states.get(root);
    if (state?.pending === 0 && state.idleWaiters.size === 0) states.delete(root);
  }

  return Object.freeze({ run, noteActivity, whenIdle, capture, isCurrentAndIdle, release });
}
