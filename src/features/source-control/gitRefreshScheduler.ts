export const GIT_REFRESH_DEBOUNCE_MS = 250;
export const GIT_FOCUS_STALE_MS = 5_000;
export const GIT_WATCHER_RETRY_INITIAL_MS = 250;
export const GIT_WATCHER_RETRY_MAX_MS = 30_000;
export const GIT_REFRESH_RETRY_INITIAL_MS = 250;
export const GIT_REFRESH_RETRY_MAX_MS = 30_000;

export type GitRefreshPriority = "debounced" | "immediate";

export type GitRefreshInvalidateOptions = {
  priority?: GitRefreshPriority;
  reason?: string;
};

export type GitRefreshSchedulerOptions<TSnapshot> = {
  readStatus: (generation: number, rootPath: string) => Promise<TSnapshot>;
  onSnapshot: (snapshot: TSnapshot, meta: {
    generation: number;
    reason: string | null;
    durationMs: number;
    rootPath: string;
    rootEpoch: number;
  }) => void;
  onError?: (error: unknown, meta: {
    generation: number;
    reason: string | null;
    durationMs: number;
    rootPath: string;
    rootEpoch: number;
  }) => void;
  onLoadingChange?: (loading: boolean, generation: number, rootEpoch: number) => void;
  onLog?: (event: {
    type: "refresh-start" | "refresh-success" | "refresh-error" | "refresh-discarded";
    generation: number;
    reason: string | null;
    durationMs?: number;
    rootPath: string | null;
    rootEpoch: number;
  }) => void;
  debounceMs?: number;
  focusStaleMs?: number;
  retryInitialMs?: number;
  retryMaxMs?: number;
  now?: () => number;
  setTimeoutFn?: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (handle: ReturnType<typeof setTimeout>) => void;
};

type InFlightRead = {
  epoch: number;
  generation: number;
  rootPath: string;
  publishable: boolean;
};

export type GitRefreshScheduler<TSnapshot> = {
  setRootPath: (rootPath: string | null) => void;
  setFocused: (focused: boolean) => void;
  invalidate: (options?: GitRefreshInvalidateOptions) => void;
  refreshNow: (reason?: string) => void;
  applyMutationSnapshot: (snapshot: TSnapshot, reason?: string) => void;
  getState: () => {
    rootPath: string | null;
    rootEpoch: number;
    requestedGeneration: number;
    appliedGeneration: number;
    inFlight: boolean;
    physicalInFlight: number;
    dirty: boolean;
    queuedPriority: GitRefreshPriority | null;
    lastSuccessfulAt: number | null;
    focused: boolean;
    lastError: unknown | null;
    lastReason: string | null;
  };
  dispose: () => void;
};

export function createGitRefreshScheduler<TSnapshot>(
  options: GitRefreshSchedulerOptions<TSnapshot>,
): GitRefreshScheduler<TSnapshot> {
  const debounceMs = options.debounceMs ?? GIT_REFRESH_DEBOUNCE_MS;
  const focusStaleMs = options.focusStaleMs ?? GIT_FOCUS_STALE_MS;
  const retryInitialMs = options.retryInitialMs ?? GIT_REFRESH_RETRY_INITIAL_MS;
  const retryMaxMs = options.retryMaxMs ?? GIT_REFRESH_RETRY_MAX_MS;
  const now = options.now ?? (() => Date.now());
  const setTimeoutFn = options.setTimeoutFn ?? ((callback, ms) => setTimeout(callback, ms));
  const clearTimeoutFn = options.clearTimeoutFn ?? ((handle) => clearTimeout(handle));

  let rootPath: string | null = null;
  // Monotonic workspace identity. Never resets to 0 on switch, so a delayed
  // response from repo A cannot collide with repo B's generation space.
  let rootEpoch = 0;
  let requestedGeneration = 0;
  let appliedGeneration = 0;
  let inFlightReads: InFlightRead[] = [];
  let dirty = false;
  let queuedPriority: GitRefreshPriority | null = null;
  let lastSuccessfulAt: number | null = null;
  let focused = true;
  let lastError: unknown | null = null;
  let lastReason: string | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let errorRetryTimer: ReturnType<typeof setTimeout> | null = null;
  let errorRetryDelayMs = retryInitialMs;
  let disposed = false;

  function clearDebounce() {
    if (debounceTimer != null) {
      clearTimeoutFn(debounceTimer);
      debounceTimer = null;
    }
  }

  function clearErrorRetry() {
    if (errorRetryTimer != null) {
      clearTimeoutFn(errorRetryTimer);
      errorRetryTimer = null;
    }
  }

  function physicalInFlightCount() {
    return inFlightReads.length;
  }

  function setLoading(loading: boolean, generation: number, epoch: number) {
    options.onLoadingChange?.(loading, generation, epoch);
  }

  function startRead(priority: GitRefreshPriority, reason: string | null) {
    if (disposed || !rootPath) return;
    // Physical single-flight: never start a second status while any promise is live,
    // including reads that were made non-publishable by a mutation or root switch.
    if (physicalInFlightCount() > 0) {
      dirty = true;
      queuedPriority = mergePriority(queuedPriority, priority);
      lastReason = reason ?? lastReason;
      return;
    }

    requestedGeneration += 1;
    const generation = requestedGeneration;
    const epoch = rootEpoch;
    const capturedRoot = rootPath;
    const read: InFlightRead = {
      epoch,
      generation,
      rootPath: capturedRoot,
      publishable: true,
    };
    inFlightReads.push(read);
    dirty = false;
    queuedPriority = null;
    lastReason = reason;
    lastError = null;
    clearErrorRetry();
    setLoading(true, generation, epoch);
    const startedAt = now();
    options.onLog?.({
      type: "refresh-start",
      generation,
      reason,
      rootPath: capturedRoot,
      rootEpoch: epoch,
    });

    void Promise.resolve(options.readStatus(generation, capturedRoot))
      .then((snapshot) => {
        settleRead(read, { ok: true, snapshot, startedAt, reason });
      })
      .catch((error) => {
        settleRead(read, { ok: false, error, startedAt, reason });
      });
  }

  function settleRead(
    read: InFlightRead,
    result: (
      | { ok: true; snapshot: TSnapshot; startedAt: number; reason: string | null }
      | { ok: false; error: unknown; startedAt: number; reason: string | null }
    ),
  ) {
    if (disposed) return;
    inFlightReads = inFlightReads.filter((entry) => entry !== read);
    const durationMs = Math.max(0, now() - result.startedAt);

    const sameWorkspace = read.epoch === rootEpoch && read.rootPath === rootPath;
    if (!sameWorkspace || !read.publishable || read.generation < appliedGeneration) {
      options.onLog?.({
        type: "refresh-discarded",
        generation: read.generation,
        reason: result.reason,
        durationMs,
        rootPath: read.rootPath,
        rootEpoch: read.epoch,
      });
      // Only clear loading if this read still owns the active epoch's loading bit
      // and nothing newer is publishable-in-flight for this epoch.
      if (sameWorkspace && read.publishable) {
        setLoading(false, read.generation, read.epoch);
      }
      maybeRunTrailing();
      return;
    }

    if (result.ok) {
      appliedGeneration = read.generation;
      lastSuccessfulAt = now();
      lastError = null;
      errorRetryDelayMs = retryInitialMs;
      options.onLog?.({
        type: "refresh-success",
        generation: read.generation,
        reason: result.reason,
        durationMs,
        rootPath: read.rootPath,
        rootEpoch: read.epoch,
      });
      options.onSnapshot(result.snapshot, {
        generation: read.generation,
        reason: result.reason,
        durationMs,
        rootPath: read.rootPath,
        rootEpoch: read.epoch,
      });
      setLoading(false, read.generation, read.epoch);
      maybeRunTrailing();
      return;
    }

    lastError = result.error;
    options.onLog?.({
      type: "refresh-error",
      generation: read.generation,
      reason: result.reason,
      durationMs,
      rootPath: read.rootPath,
      rootEpoch: read.epoch,
    });
    options.onError?.(result.error, {
      generation: read.generation,
      reason: result.reason,
      durationMs,
      rootPath: read.rootPath,
      rootEpoch: read.epoch,
    });
    setLoading(false, read.generation, read.epoch);
    scheduleErrorRetry(result.reason);
    maybeRunTrailing();
  }

  function scheduleErrorRetry(reason: string | null) {
    if (disposed || !rootPath || !focused || errorRetryTimer != null) return;
    const delay = errorRetryDelayMs;
    errorRetryDelayMs = Math.min(errorRetryDelayMs * 2, retryMaxMs);
    errorRetryTimer = setTimeoutFn(() => {
      errorRetryTimer = null;
      if (disposed || !rootPath) return;
      schedule("immediate", reason ? `refresh-retry:${reason}` : "refresh-retry");
    }, delay);
  }

  function maybeRunTrailing() {
    if (!dirty || physicalInFlightCount() > 0) return;
    const priority = queuedPriority ?? "debounced";
    dirty = false;
    queuedPriority = null;
    if (!focused && priority !== "immediate") {
      dirty = true;
      queuedPriority = priority;
      return;
    }
    startRead(priority, lastReason);
  }

  function schedule(priority: GitRefreshPriority, reason: string | null) {
    if (disposed || !rootPath) return;
    lastReason = reason ?? lastReason;

    if (!focused && priority !== "immediate") {
      dirty = true;
      queuedPriority = mergePriority(queuedPriority, priority);
      return;
    }

    if (physicalInFlightCount() > 0) {
      dirty = true;
      queuedPriority = mergePriority(queuedPriority, priority);
      return;
    }

    if (priority === "immediate") {
      clearDebounce();
      startRead("immediate", reason);
      return;
    }

    queuedPriority = mergePriority(queuedPriority, "debounced");
    clearDebounce();
    debounceTimer = setTimeoutFn(() => {
      debounceTimer = null;
      const nextPriority = queuedPriority ?? "debounced";
      queuedPriority = null;
      startRead(nextPriority, lastReason);
    }, debounceMs);
  }

  return {
    setRootPath(nextRootPath) {
      if (nextRootPath === rootPath) return;
      clearDebounce();
      clearErrorRetry();
      rootEpoch += 1;
      rootPath = nextRootPath;
      requestedGeneration = 0;
      appliedGeneration = 0;
      // Keep physical promises alive, but make them non-publishable.
      for (const read of inFlightReads) {
        read.publishable = false;
      }
      dirty = false;
      queuedPriority = null;
      lastSuccessfulAt = null;
      lastError = null;
      lastReason = null;
      errorRetryDelayMs = retryInitialMs;
    },

    setFocused(nextFocused) {
      const wasFocused = focused;
      focused = nextFocused;
      if (!wasFocused && nextFocused) {
        const stale = lastSuccessfulAt == null || (now() - lastSuccessfulAt) >= focusStaleMs;
        if (dirty || stale || lastError != null) {
          schedule("immediate", dirty ? (lastReason ?? "focus") : (lastError != null ? "focus-error" : "focus-stale"));
        }
      }
    },

    invalidate(invalidateOptions = {}) {
      const priority = invalidateOptions.priority ?? "debounced";
      schedule(priority, invalidateOptions.reason ?? null);
    },

    refreshNow(reason = "manual") {
      schedule("immediate", reason);
    },

    applyMutationSnapshot(snapshot, reason = "mutation") {
      if (!rootPath) return;
      clearDebounce();
      clearErrorRetry();
      requestedGeneration += 1;
      appliedGeneration = requestedGeneration;
      // Older in-flight reads become ineligible to publish, but remain physically
      // in flight so we do not start another status until they settle.
      for (const read of inFlightReads) {
        read.publishable = false;
      }
      dirty = false;
      queuedPriority = null;
      lastSuccessfulAt = now();
      lastError = null;
      lastReason = reason;
      errorRetryDelayMs = retryInitialMs;
      options.onSnapshot(snapshot, {
        generation: appliedGeneration,
        reason,
        durationMs: 0,
        rootPath,
        rootEpoch,
      });
      setLoading(false, appliedGeneration, rootEpoch);
    },

    getState() {
      return {
        rootPath,
        rootEpoch,
        requestedGeneration,
        appliedGeneration,
        inFlight: inFlightReads.some((read) => read.publishable && read.epoch === rootEpoch),
        physicalInFlight: physicalInFlightCount(),
        dirty,
        queuedPriority,
        lastSuccessfulAt,
        focused,
        lastError,
        lastReason,
      };
    },

    dispose() {
      disposed = true;
      clearDebounce();
      clearErrorRetry();
      for (const read of inFlightReads) {
        read.publishable = false;
      }
      inFlightReads = [];
      dirty = false;
      queuedPriority = null;
    },
  };
}

function mergePriority(
  current: GitRefreshPriority | null,
  next: GitRefreshPriority,
): GitRefreshPriority {
  if (current === "immediate" || next === "immediate") return "immediate";
  return "debounced";
}
