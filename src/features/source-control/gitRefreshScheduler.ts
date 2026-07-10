export const GIT_REFRESH_DEBOUNCE_MS = 250;
export const GIT_FOCUS_STALE_MS = 5_000;
export const GIT_WATCHER_RETRY_INITIAL_MS = 250;
export const GIT_WATCHER_RETRY_MAX_MS = 30_000;

export type GitRefreshPriority = "debounced" | "immediate";

export type GitRefreshInvalidateOptions = {
  priority?: GitRefreshPriority;
  reason?: string;
};

export type GitRefreshSchedulerOptions<TSnapshot> = {
  readStatus: (generation: number) => Promise<TSnapshot>;
  onSnapshot: (snapshot: TSnapshot, meta: { generation: number; reason: string | null }) => void;
  onError?: (error: unknown, meta: { generation: number; reason: string | null }) => void;
  onLoadingChange?: (loading: boolean, generation: number) => void;
  debounceMs?: number;
  focusStaleMs?: number;
  now?: () => number;
  setTimeoutFn?: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (handle: ReturnType<typeof setTimeout>) => void;
};

export type GitRefreshScheduler<TSnapshot> = {
  setRootPath: (rootPath: string | null) => void;
  setFocused: (focused: boolean) => void;
  invalidate: (options?: GitRefreshInvalidateOptions) => void;
  refreshNow: (reason?: string) => void;
  applyMutationSnapshot: (snapshot: TSnapshot, reason?: string) => void;
  getState: () => {
    rootPath: string | null;
    requestedGeneration: number;
    appliedGeneration: number;
    inFlight: boolean;
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
  const now = options.now ?? (() => Date.now());
  const setTimeoutFn = options.setTimeoutFn ?? ((callback, ms) => setTimeout(callback, ms));
  const clearTimeoutFn = options.clearTimeoutFn ?? ((handle) => clearTimeout(handle));

  let rootPath: string | null = null;
  let requestedGeneration = 0;
  let appliedGeneration = 0;
  let inFlightGeneration: number | null = null;
  let dirty = false;
  let queuedPriority: GitRefreshPriority | null = null;
  let lastSuccessfulAt: number | null = null;
  let focused = true;
  let lastError: unknown | null = null;
  let lastReason: string | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  function clearDebounce() {
    if (debounceTimer != null) {
      clearTimeoutFn(debounceTimer);
      debounceTimer = null;
    }
  }

  function setLoading(loading: boolean, generation: number) {
    options.onLoadingChange?.(loading, generation);
  }

  function startRead(priority: GitRefreshPriority, reason: string | null) {
    if (disposed || !rootPath) return;
    if (inFlightGeneration != null) {
      dirty = true;
      queuedPriority = mergePriority(queuedPriority, priority);
      lastReason = reason ?? lastReason;
      return;
    }

    requestedGeneration += 1;
    const generation = requestedGeneration;
    inFlightGeneration = generation;
    dirty = false;
    queuedPriority = null;
    lastReason = reason;
    lastError = null;
    setLoading(true, generation);

    void Promise.resolve(options.readStatus(generation))
      .then((snapshot) => {
        if (disposed) return;
        const wasInFlight = generation === inFlightGeneration;
        if (wasInFlight) inFlightGeneration = null;
        if (generation < appliedGeneration) {
          if (wasInFlight) {
            setLoading(false, generation);
            maybeRunTrailing();
          }
          return;
        }
        appliedGeneration = generation;
        lastSuccessfulAt = now();
        lastError = null;
        options.onSnapshot(snapshot, { generation, reason });
        setLoading(false, generation);
        maybeRunTrailing();
      })
      .catch((error) => {
        if (disposed) return;
        const wasInFlight = generation === inFlightGeneration;
        if (wasInFlight) inFlightGeneration = null;
        if (generation < appliedGeneration) {
          if (wasInFlight) {
            setLoading(false, generation);
            maybeRunTrailing();
          }
          return;
        }
        lastError = error;
        options.onError?.(error, { generation, reason });
        setLoading(false, generation);
        maybeRunTrailing();
      });
  }

  function maybeRunTrailing() {
    if (!dirty || inFlightGeneration != null) return;
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

    if (inFlightGeneration != null) {
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
      rootPath = nextRootPath;
      requestedGeneration = 0;
      appliedGeneration = 0;
      inFlightGeneration = null;
      dirty = false;
      queuedPriority = null;
      lastSuccessfulAt = null;
      lastError = null;
      lastReason = null;
    },

    setFocused(nextFocused) {
      const wasFocused = focused;
      focused = nextFocused;
      if (!wasFocused && nextFocused) {
        const stale = lastSuccessfulAt == null || (now() - lastSuccessfulAt) >= focusStaleMs;
        if (dirty || stale) {
          schedule("immediate", dirty ? (lastReason ?? "focus") : "focus-stale");
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
      clearDebounce();
      requestedGeneration += 1;
      appliedGeneration = requestedGeneration;
      // Any older in-flight read becomes ineligible to publish.
      inFlightGeneration = null;
      dirty = false;
      queuedPriority = null;
      lastSuccessfulAt = now();
      lastError = null;
      lastReason = reason;
      options.onSnapshot(snapshot, { generation: appliedGeneration, reason });
      setLoading(false, appliedGeneration);
    },

    getState() {
      return {
        rootPath,
        requestedGeneration,
        appliedGeneration,
        inFlight: inFlightGeneration != null,
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
      inFlightGeneration = null;
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
