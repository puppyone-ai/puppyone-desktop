/**
 * Serializes application-owned Git mutations.
 *
 * Lock domains:
 * - `worktree:<root>` — index / working-tree mutations (stage, commit, discard)
 * - `repository:<commonDir|root>` — shared-ref / network mutations (fetch, push,
 *   checkout, branch). Linked worktrees that share a commonDir share this lock.
 *
 * Status reads wait for both domains of the active root so they never race an
 * in-flight mutation that can change the snapshot they are about to publish.
 */
export function createGitOperationCoordinator() {
  const tails = new Map();

  function run(lockKey, operation) {
    return runAll([lockKey], operation);
  }

  /**
   * Reserve every mutation domain synchronously, then run after the prior
   * owners of those domains settle. Publishing one shared tail to every key
   * makes acquisition atomic inside this process and avoids nested-lock
   * deadlocks for operations such as Commit that update both index and refs.
   */
  function runAll(lockKeys, operation) {
    const keys = normalizeLockKeys(lockKeys);
    if (typeof operation !== "function") {
      throw new TypeError("A Git operation callback is required.");
    }
    const previous = [...new Set(keys.map((key) => tails.get(key)).filter(Boolean))];
    const ready = previous.length > 0
      ? Promise.all(previous.map((tail) => tail.catch(() => undefined)))
      : Promise.resolve();
    const result = ready.then(operation);
    let tail;
    const release = () => {
      for (const key of keys) {
        if (tails.get(key) === tail) tails.delete(key);
      }
    };
    tail = result.then(
      () => { release(); },
      () => { release(); },
    );
    for (const key of keys) tails.set(key, tail);
    return result;
  }

  /** Low-priority acquisition: never queues ahead of an existing owner. */
  function tryRunAll(lockKeys, operation) {
    const keys = normalizeLockKeys(lockKeys);
    if (keys.some((key) => tails.has(key))) return null;
    return runAll(keys, operation);
  }

  async function whenIdle(lockKey, options = {}) {
    const key = normalizeLockKey(lockKey);
    const tail = tails.get(key);
    if (!tail) return;
    await waitForPromiseOrAbort(tail, options.signal);
  }

  async function whenIdleAll(lockKeys, options = {}) {
    const pending = [...new Set(normalizeLockKeys(lockKeys).map((key) => tails.get(key)).filter(Boolean))];
    if (pending.length === 0) return;
    await waitForPromiseOrAbort(Promise.all(pending), options.signal);
  }

  return {
    run,
    runAll,
    tryRunAll,
    whenIdle,
    whenIdleAll,
    isIdle: (lockKey) => !tails.has(normalizeLockKey(lockKey)),
    isIdleAll: (lockKeys) => normalizeLockKeys(lockKeys).every((key) => !tails.has(key)),
    getActiveRepositoryCount: () => tails.size,
  };
}

export function worktreeLockKey(rootPath) {
  return `worktree:${normalizeLockKey(rootPath)}`;
}

export function repositoryLockKey(commonDirOrRoot) {
  return `repository:${normalizeLockKey(commonDirOrRoot)}`;
}

function normalizeLockKey(lockKey) {
  const key = String(lockKey || "").trim();
  if (!key) throw new TypeError("A Git operation lock key is required.");
  return key;
}

function normalizeLockKeys(lockKeys) {
  if (!Array.isArray(lockKeys) || lockKeys.length === 0) {
    throw new TypeError("At least one Git operation lock key is required.");
  }
  return [...new Set(lockKeys.map(normalizeLockKey))].sort((left, right) => left.localeCompare(right));
}

function waitForPromiseOrAbort(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(createAbortError());
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(createAbortError());
    };
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      () => {
        cleanup();
        resolve();
      },
      () => {
        cleanup();
        resolve();
      },
    );
  });
}

function createAbortError() {
  const error = new Error("Git status wait was cancelled.");
  error.name = "AbortError";
  error.code = "ABORT_ERR";
  return error;
}
