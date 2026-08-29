import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createGitAutoCommitService,
  isGitAutoCommitEffectivelyEnabled,
} from "../electron/main/git-auto-commit/service.mjs";

const root = path.resolve("/workspace/project");
const identity = Object.freeze({
  repository: true,
  workspaceRoot: root,
  topLevel: root,
  gitDir: path.join(root, ".git"),
  commonDir: path.join(root, ".git"),
});
const policy = Object.freeze({
  enabled: true,
  scope: "untracked-only",
  minimumIntervalMs: 300_000,
  quietPeriodMs: 60_000,
  updatedAt: null,
});

describe("Git Auto Commit main-process service", () => {
  it("requires every release, user, workspace, and repository gate", () => {
    for (const releaseAvailable of [false, true]) {
      for (const experimentalOptIn of [false, true]) {
        for (const workspaceEnabled of [false, true]) {
          for (const repository of [false, true]) {
            expect(isGitAutoCommitEffectivelyEnabled({
              releaseAvailable,
              experimentalOptIn,
              workspaceEnabled,
              repository,
            })).toBe(releaseAvailable && experimentalOptIn && workspaceEnabled && repository);
          }
        }
      }
    }
  });

  it("drains documents and workspace writes before entering the Git transaction", async () => {
    const harness = createHarness();
    await harness.service.assignWorkspace(harness.webContents, root);
    harness.order.length = 0;

    await harness.clock.advance(300_000);
    await flushMicrotasks();

    expect(harness.runTransaction).toHaveBeenCalledOnce();
    expect(harness.order).toEqual(["document-drain", "workspace-idle", "lease", "recover", "transaction"]);
    const transactionOptions = harness.runTransaction.mock.calls[0][1];
    expect(transactionOptions.contentEpoch).toBe(4);
    expect(transactionOptions.isContentEpochCurrent(4)).toBe(true);
    expect(harness.gitMetadataWatchService.invalidateWorkingTree).toHaveBeenCalledWith(root);
  });

  it("recovers journals but never schedules a transaction when the release gate is off", async () => {
    const harness = createHarness({ releaseAvailable: false });
    await harness.service.assignWorkspace(harness.webContents, root);
    expect(harness.recoverTransaction).toHaveBeenCalledOnce();

    harness.activity();
    await harness.clock.advance(600_000);
    await flushMicrotasks();
    expect(harness.runTransaction).not.toHaveBeenCalled();
  });

  it("skips instead of queueing behind an interactive Git owner", async () => {
    const harness = createHarness({ gitBusy: true });
    await harness.service.assignWorkspace(harness.webContents, root);
    await harness.clock.advance(300_000);
    await flushMicrotasks();

    expect(harness.runTransaction).not.toHaveBeenCalled();
    const lastSnapshot = harness.webContents.send.mock.calls.at(-1)?.[1];
    expect(lastSnapshot.runtime.lastResult).toMatchObject({
      outcome: "skipped",
      reason: "git-busy",
      retryable: true,
    });
  });

  it("cancels a waiting workspace when its window releases ownership", async () => {
    const harness = createHarness();
    await harness.service.assignWorkspace(harness.webContents, root);
    harness.service.releaseWindow(harness.webContents.id);

    await harness.clock.advance(600_000);
    await flushMicrotasks();
    expect(harness.runTransaction).not.toHaveBeenCalled();
    expect(harness.stopActivity).toHaveBeenCalledOnce();
  });
});

function createHarness({ releaseAvailable = true, gitBusy = false } = {}) {
  const order = [];
  const clock = createFakeClock();
  const preferenceStore = {
    getSnapshot: vi.fn(async () => ({ experimentalOptIn: true, workspacePolicy: policy })),
    setExperimentalOptIn: vi.fn(),
    setWorkspacePolicy: vi.fn(),
  };
  const recoverTransaction = vi.fn(async () => {
    order.push("recover");
    return { outcome: "no-op", reason: "no-pending-transaction", retryable: false };
  });
  const runTransaction = vi.fn(async () => {
    order.push("transaction");
    return {
      outcome: "committed",
      reason: "untracked-files-committed",
      commitId: "a".repeat(40),
      pathCount: 1,
      retryable: false,
    };
  });
  let activity = () => undefined;
  const stopActivity = vi.fn();
  const workspaceWatchService = {
    subscribeActivity: vi.fn((_rootPath, listener) => {
      activity = listener;
      return stopActivity;
    }),
  };
  const workspaceMutationTracker = {
    noteActivity: vi.fn(),
    whenIdle: vi.fn(async () => { order.push("workspace-idle"); }),
    capture: vi.fn(() => ({ epoch: 4, idle: true })),
    isCurrentAndIdle: vi.fn((_rootPath, epoch) => epoch === 4),
    release: vi.fn(),
  };
  const gitOperationCoordinator = {
    runAll: vi.fn((_keys, operation) => operation()),
    tryRunAll: vi.fn((_keys, operation) => (gitBusy ? null : operation())),
  };
  const operationLease = {
    acquire: vi.fn(async () => {
      order.push("lease");
      return { release: vi.fn(async () => undefined) };
    }),
  };
  const documentDurabilityCoordinator = {
    requestFlush: vi.fn(async () => {
      order.push("document-drain");
      return { ok: true, kind: null };
    }),
  };
  const gitMetadataWatchService = { invalidateWorkingTree: vi.fn() };
  const webContents = {
    id: 41,
    isDestroyed: () => false,
    send: vi.fn(),
  };
  const service = createGitAutoCommitService({
    releaseAvailable,
    preferenceStore,
    transactionJournal: {},
    operationLease,
    gitOperationCoordinator,
    documentDurabilityCoordinator,
    workspaceMutationTracker,
    workspaceWatchService,
    gitMetadataWatchService,
    resolveRepositoryIdentity: vi.fn(async () => identity),
    runTransaction,
    recoverTransaction,
    clock,
    logger: { warn: vi.fn() },
  });
  return {
    service,
    clock,
    order,
    activity: () => activity(),
    stopActivity,
    runTransaction,
    recoverTransaction,
    gitMetadataWatchService,
    webContents,
  };
}

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
        await flushMicrotasks();
      }
      now = target;
      await flushMicrotasks();
    },
  };
}

async function flushMicrotasks() {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}
