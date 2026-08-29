import { performance } from "node:perf_hooks";

const RETRY_BACKOFF_MS = 30_000;

export function createGitAutoCommitDeadlineScheduler({
  run,
  onStateChange = () => undefined,
  clock = createSystemClock(),
} = {}) {
  if (typeof run !== "function") throw new TypeError("An Auto Commit run callback is required.");
  let policy = null;
  let enabled = false;
  let dirty = false;
  let active = false;
  let disposed = false;
  let timer = null;
  let dirtySince = null;
  let lastActivityAt = null;
  let lastAttemptAt = null;
  let nextEligibleAt = null;

  function setPolicy(nextPolicy, effectiveEnabled) {
    policy = nextPolicy;
    enabled = effectiveEnabled === true;
    if (!enabled) {
      clearScheduledTimer();
      emit("disabled");
      return;
    }
    if (dirty) schedule();
    else emit(active ? "running" : "idle");
  }

  function markDirty() {
    if (disposed) return;
    const now = clock.monotonicNow();
    dirty = true;
    dirtySince ??= now;
    lastActivityAt = now;
    if (enabled && !active) schedule();
  }

  function reconcileAfterResume() {
    if (!disposed && enabled && dirty && !active) schedule();
  }

  function schedule(minimumDelayMs = 0) {
    clearScheduledTimer();
    if (disposed || !enabled || !dirty || active || !policy) return;
    const now = clock.monotonicNow();
    const intervalBase = lastAttemptAt ?? dirtySince ?? now;
    nextEligibleAt = Math.max(
      now + Math.max(0, minimumDelayMs),
      intervalBase + policy.minimumIntervalMs,
      (lastActivityAt ?? now) + policy.quietPeriodMs,
    );
    const delay = Math.max(0, nextEligibleAt - now);
    timer = clock.setTimeout(() => {
      timer = null;
      void execute();
    }, delay);
    timer?.unref?.();
    emit("waiting");
  }

  async function execute() {
    if (disposed || !enabled || !dirty || active) return;
    const now = clock.monotonicNow();
    if (nextEligibleAt !== null && now < nextEligibleAt) {
      schedule();
      return;
    }
    active = true;
    dirty = false;
    dirtySince = null;
    nextEligibleAt = null;
    emit("running");
    let outcome;
    try {
      outcome = await run();
    } finally {
      active = false;
      lastAttemptAt = clock.monotonicNow();
    }
    if (outcome?.retryable === true) {
      dirty = true;
      dirtySince ??= lastAttemptAt;
      lastActivityAt ??= lastAttemptAt;
    }
    if (dirty && enabled && !disposed) schedule(outcome?.retryable ? RETRY_BACKOFF_MS : 0);
    else emit(enabled ? "idle" : "disabled");
  }

  function dispose() {
    disposed = true;
    enabled = false;
    clearScheduledTimer();
  }

  function snapshot() {
    const now = clock.monotonicNow();
    return Object.freeze({
      state: !enabled ? "disabled" : active ? "running" : dirty ? "waiting" : "idle",
      dirty,
      active,
      nextEligibleAt: nextEligibleAt === null
        ? null
        : new Date(clock.wallNow() + Math.max(0, nextEligibleAt - now)).toISOString(),
    });
  }

  function emit(state) {
    onStateChange({ ...snapshot(), state });
  }

  function clearScheduledTimer() {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
    nextEligibleAt = null;
  }

  return Object.freeze({ setPolicy, markDirty, reconcileAfterResume, snapshot, dispose });
}

export function createSystemClock() {
  return Object.freeze({
    monotonicNow: () => performance.now(),
    wallNow: () => Date.now(),
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: (timer) => clearTimeout(timer),
  });
}
