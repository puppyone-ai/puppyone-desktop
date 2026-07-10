import { describe, expect, it, vi } from "vitest";
import {
  createGitRefreshScheduler,
  GIT_FOCUS_STALE_MS,
  GIT_REFRESH_DEBOUNCE_MS,
} from "../src/features/source-control/gitRefreshScheduler";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(times = 8) {
  for (let index = 0; index < times; index += 1) {
    await Promise.resolve();
  }
}

describe("gitRefreshScheduler", () => {
  it("allows one in-flight read and at most one trailing refresh after a burst", async () => {
    const reads: Array<ReturnType<typeof createDeferred<{ id: number }>>> = [];
    const snapshots: Array<{ id: number }> = [];
    const timers: Array<{ callback: () => void; ms: number }> = [];

    const scheduler = createGitRefreshScheduler({
      debounceMs: GIT_REFRESH_DEBOUNCE_MS,
      readStatus: async () => {
        const deferred = createDeferred<{ id: number }>();
        reads.push(deferred);
        return deferred.promise;
      },
      onSnapshot: (snapshot) => {
        snapshots.push(snapshot);
      },
      setTimeoutFn: (callback, ms) => {
        timers.push({ callback, ms });
        return timers.length as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimeoutFn: () => {},
    });

    scheduler.setRootPath("/repo");
    scheduler.invalidate({ reason: "working-tree" });
    expect(timers).toHaveLength(1);
    expect(timers[0]?.ms).toBe(GIT_REFRESH_DEBOUNCE_MS);
    timers[0]?.callback();

    expect(reads).toHaveLength(1);
    scheduler.invalidate({ reason: "metadata" });
    scheduler.invalidate({ reason: "metadata" });
    expect(reads).toHaveLength(1);
    expect(scheduler.getState().dirty).toBe(true);

    reads[0]?.resolve({ id: 1 });
    await flushMicrotasks();

    expect(snapshots).toEqual([{ id: 1 }]);
    expect(reads).toHaveLength(2);

    reads[1]?.resolve({ id: 2 });
    await flushMicrotasks();

    expect(snapshots).toEqual([{ id: 1 }, { id: 2 }]);
    expect(scheduler.getState().inFlight).toBe(false);
    expect(scheduler.getState().dirty).toBe(false);
    scheduler.dispose();
  });

  it("never lets an older deferred response overwrite a newer generation or mutation", async () => {
    const first = createDeferred<{ label: string }>();
    const second = createDeferred<{ label: string }>();
    const snapshots: Array<{ label: string }> = [];
    let call = 0;

    const scheduler = createGitRefreshScheduler({
      debounceMs: 0,
      readStatus: async () => {
        call += 1;
        return call === 1 ? first.promise : second.promise;
      },
      onSnapshot: (snapshot) => {
        snapshots.push(snapshot);
      },
      setTimeoutFn: (callback) => {
        callback();
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimeoutFn: () => {},
    });

    scheduler.setRootPath("/repo");
    scheduler.invalidate({ reason: "working-tree" });
    expect(call).toBe(1);

    scheduler.applyMutationSnapshot({ label: "mutation" }, "commit");
    expect(snapshots).toEqual([{ label: "mutation" }]);
    expect(scheduler.getState().appliedGeneration).toBe(2);

    first.resolve({ label: "stale" });
    await flushMicrotasks();

    expect(snapshots).toEqual([{ label: "mutation" }]);

    scheduler.refreshNow("manual");
    expect(call).toBe(2);
    second.resolve({ label: "fresh" });
    await flushMicrotasks();

    expect(snapshots).toEqual([{ label: "mutation" }, { label: "fresh" }]);
    scheduler.dispose();
  });

  it("queues background invalidation while unfocused and drains on focus", async () => {
    const snapshots: string[] = [];
    const timers: Array<{ callback: () => void }> = [];

    const scheduler = createGitRefreshScheduler({
      debounceMs: 10,
      readStatus: async () => "status",
      onSnapshot: (snapshot) => {
        snapshots.push(snapshot);
      },
      setTimeoutFn: (callback) => {
        timers.push({ callback });
        return timers.length as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimeoutFn: () => {},
    });

    scheduler.setRootPath("/repo");
    scheduler.setFocused(false);
    scheduler.invalidate({ reason: "metadata" });
    expect(timers).toHaveLength(0);
    expect(scheduler.getState().dirty).toBe(true);

    scheduler.setFocused(true);
    await flushMicrotasks();
    expect(snapshots).toEqual(["status"]);
    scheduler.dispose();
  });

  it("reconciles on focus when the last successful snapshot is stale", async () => {
    let now = 1_000;
    const snapshots: string[] = [];

    const scheduler = createGitRefreshScheduler({
      debounceMs: 0,
      focusStaleMs: GIT_FOCUS_STALE_MS,
      now: () => now,
      readStatus: async () => `status-${now}`,
      onSnapshot: (snapshot) => {
        snapshots.push(snapshot);
      },
      setTimeoutFn: (callback) => {
        callback();
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimeoutFn: () => {},
    });

    scheduler.setRootPath("/repo");
    scheduler.refreshNow("initial");
    await flushMicrotasks();
    expect(snapshots).toEqual(["status-1000"]);

    scheduler.setFocused(false);
    now += GIT_FOCUS_STALE_MS + 1;
    scheduler.setFocused(true);
    await flushMicrotasks();

    expect(snapshots).toEqual(["status-1000", `status-${now}`]);
    scheduler.dispose();
  });

  it("preserves the last good snapshot path by not clearing on transient read errors", async () => {
    const onError = vi.fn();
    const snapshots: string[] = [];
    let shouldFail = false;

    const scheduler = createGitRefreshScheduler({
      debounceMs: 0,
      readStatus: async () => {
        if (shouldFail) throw new Error("transient");
        return "ok";
      },
      onSnapshot: (snapshot) => {
        snapshots.push(snapshot);
      },
      onError,
      setTimeoutFn: (callback) => {
        callback();
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimeoutFn: () => {},
    });

    scheduler.setRootPath("/repo");
    scheduler.refreshNow("initial");
    await flushMicrotasks();
    expect(snapshots).toEqual(["ok"]);

    shouldFail = true;
    scheduler.refreshNow("retry");
    await flushMicrotasks();

    expect(snapshots).toEqual(["ok"]);
    expect(onError).toHaveBeenCalledOnce();
    expect(scheduler.getState().lastError).toBeInstanceOf(Error);
    scheduler.dispose();
  });
});
