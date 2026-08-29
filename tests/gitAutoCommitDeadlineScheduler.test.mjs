import { describe, expect, it, vi } from "vitest";
import { createGitAutoCommitDeadlineScheduler } from "../electron/main/git-auto-commit/deadline-scheduler.mjs";

function createFakeClock() {
  let now = 0;
  let sequence = 0;
  const timers = new Map();
  return {
    monotonicNow: () => now,
    wallNow: () => 1_800_000_000_000 + now,
    setTimeout(callback, delay) {
      const id = ++sequence;
      timers.set(id, { at: now + delay, callback });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    async advance(milliseconds) {
      const target = now + milliseconds;
      while (true) {
        const next = [...timers.entries()]
          .filter(([, timer]) => timer.at <= target)
          .sort((left, right) => left[1].at - right[1].at)[0];
        if (!next) break;
        timers.delete(next[0]);
        now = next[1].at;
        next[1].callback();
        await Promise.resolve();
        await Promise.resolve();
      }
      now = target;
      await Promise.resolve();
      await Promise.resolve();
    },
    timerCount: () => timers.size,
  };
}

const policy = { minimumIntervalMs: 300_000, quietPeriodMs: 60_000 };

describe("Git Auto Commit deadline scheduler", () => {
  it("does no work until the effective gate is enabled", async () => {
    const clock = createFakeClock();
    const run = vi.fn(async () => ({ retryable: false }));
    const scheduler = createGitAutoCommitDeadlineScheduler({ run, clock });
    scheduler.setPolicy(policy, false);
    scheduler.markDirty();
    await clock.advance(600_000);
    expect(run).not.toHaveBeenCalled();
    expect(clock.timerCount()).toBe(0);
  });

  it("coalesces activity behind the minimum interval and quiet period", async () => {
    const clock = createFakeClock();
    const run = vi.fn(async () => ({ retryable: false }));
    const scheduler = createGitAutoCommitDeadlineScheduler({ run, clock });
    scheduler.setPolicy(policy, true);
    scheduler.markDirty();
    await clock.advance(250_000);
    scheduler.markDirty();
    await clock.advance(59_999);
    expect(run).not.toHaveBeenCalled();
    await clock.advance(1);
    expect(run).toHaveBeenCalledOnce();
  });

  it("runs one trailing attempt after activity during an active run", async () => {
    const clock = createFakeClock();
    let finishFirst;
    const first = new Promise((resolve) => { finishFirst = resolve; });
    const run = vi.fn()
      .mockImplementationOnce(() => first)
      .mockResolvedValue({ retryable: false });
    const scheduler = createGitAutoCommitDeadlineScheduler({ run, clock });
    scheduler.setPolicy(policy, true);
    scheduler.markDirty();
    await clock.advance(300_000);
    expect(run).toHaveBeenCalledOnce();
    scheduler.markDirty();
    finishFirst({ retryable: false });
    await Promise.resolve();
    await Promise.resolve();
    await clock.advance(299_999);
    expect(run).toHaveBeenCalledOnce();
    await clock.advance(1);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("does not replay every missed deadline after resume", async () => {
    const clock = createFakeClock();
    const run = vi.fn(async () => ({ retryable: false }));
    const scheduler = createGitAutoCommitDeadlineScheduler({ run, clock });
    scheduler.setPolicy(policy, true);
    scheduler.markDirty();
    await clock.advance(3_600_000);
    scheduler.reconcileAfterResume();
    await Promise.resolve();
    expect(run).toHaveBeenCalledOnce();
  });

  it("cancels a safe waiting phase when disabled", async () => {
    const clock = createFakeClock();
    const run = vi.fn(async () => ({ retryable: false }));
    const scheduler = createGitAutoCommitDeadlineScheduler({ run, clock });
    scheduler.setPolicy(policy, true);
    scheduler.markDirty();
    scheduler.setPolicy(policy, false);
    await clock.advance(600_000);
    expect(run).not.toHaveBeenCalled();
  });
});
