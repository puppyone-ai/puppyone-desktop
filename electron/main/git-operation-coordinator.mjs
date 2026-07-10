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
    const key = normalizeLockKey(lockKey);
    const previous = tails.get(key) ?? Promise.resolve();
    const result = previous.catch(() => {}).then(operation);
    const tail = result.then(() => undefined, () => undefined);
    tails.set(key, tail);
    void tail.finally(() => {
      if (tails.get(key) === tail) tails.delete(key);
    });
    return result;
  }

  async function whenIdle(lockKey, options = {}) {
    const key = normalizeLockKey(lockKey);
    const tail = tails.get(key);
    if (!tail) return;
    await waitForPromiseOrAbort(tail, options.signal);
  }

  async function whenIdleAll(lockKeys, options = {}) {
    const unique = [...new Set(lockKeys.map(normalizeLockKey).filter(Boolean))];
    for (const key of unique) {
      await whenIdle(key, options);
    }
  }

  return {
    run,
    whenIdle,
    whenIdleAll,
    isIdle: (lockKey) => !tails.has(normalizeLockKey(lockKey)),
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
  return String(lockKey || "").trim();
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
