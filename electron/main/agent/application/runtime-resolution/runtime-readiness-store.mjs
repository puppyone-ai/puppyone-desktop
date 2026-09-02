const DEFAULT_SUCCESS_TTL_MS = 5 * 60_000;

/** Process-local, generation-stamped snapshots. Launch data never leaves main. */
export function createRuntimeReadinessStore({
  now = () => Date.now(),
  successTtlMs = DEFAULT_SUCCESS_TTL_MS,
} = {}) {
  const snapshots = new Map();
  let generation = 0;

  function key(runtimeId, workspaceRoot) {
    return `${runtimeId}\0${workspaceRoot || ""}`;
  }

  function get(runtimeId, workspaceRoot) {
    const snapshot = snapshots.get(key(runtimeId, workspaceRoot));
    if (!snapshot) return null;
    if (snapshot.generation !== generation || snapshot.expiresAt <= now()) {
      snapshots.delete(key(runtimeId, workspaceRoot));
      return null;
    }
    return snapshot;
  }

  function set(runtimeId, workspaceRoot, value, { ttlMs = successTtlMs } = {}) {
    const observedAt = now();
    const snapshot = Object.freeze({
      ...value,
      runtimeId,
      workspaceRoot,
      generation,
      observedAt,
      expiresAt: observedAt + Math.max(1, ttlMs),
    });
    snapshots.set(key(runtimeId, workspaceRoot), snapshot);
    return snapshot;
  }

  function invalidate(runtimeId, workspaceRoot) {
    snapshots.delete(key(runtimeId, workspaceRoot));
  }

  function clear() {
    generation += 1;
    snapshots.clear();
    return generation;
  }

  return {
    get,
    set,
    invalidate,
    clear,
    generation: () => generation,
  };
}

export const runtimeReadinessStorePolicy = Object.freeze({
  successTtlMs: DEFAULT_SUCCESS_TTL_MS,
});
