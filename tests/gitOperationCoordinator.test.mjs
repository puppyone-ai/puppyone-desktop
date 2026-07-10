import { describe, expect, it } from "vitest";
import {
  createGitOperationCoordinator,
  repositoryLockKey,
  worktreeLockKey,
} from "../electron/main/git-operation-coordinator.mjs";

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("git operation coordinator", () => {
  it("serializes mutations for one lock key", async () => {
    const coordinator = createGitOperationCoordinator();
    const firstGate = deferred();
    const order = [];
    const key = worktreeLockKey("/repo");

    const first = coordinator.run(key, async () => {
      order.push("first:start");
      await firstGate.promise;
      order.push("first:end");
    });
    const second = coordinator.run(key, async () => {
      order.push("second:start");
      order.push("second:end");
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(["first:start"]);
    firstGate.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(["first:start", "first:end", "second:start", "second:end"]);
    expect(coordinator.isIdle(key)).toBe(true);
  });

  it("keeps independent lock keys parallel", async () => {
    const coordinator = createGitOperationCoordinator();
    const gate = deferred();
    const started = [];

    const repoA = coordinator.run(worktreeLockKey("/repo-a"), async () => {
      started.push("a");
      await gate.promise;
    });
    const repoB = coordinator.run(worktreeLockKey("/repo-b"), async () => {
      started.push("b");
      await gate.promise;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(started.sort()).toEqual(["a", "b"]);
    gate.resolve();
    await Promise.all([repoA, repoB]);
  });

  it("serializes linked worktrees that share a repository lock", async () => {
    const coordinator = createGitOperationCoordinator();
    const firstGate = deferred();
    const order = [];
    const shared = repositoryLockKey("/common-git-dir");

    const first = coordinator.run(shared, async () => {
      order.push("wt-a:start");
      await firstGate.promise;
      order.push("wt-a:end");
    });
    const second = coordinator.run(shared, async () => {
      order.push("wt-b:start");
      order.push("wt-b:end");
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(["wt-a:start"]);
    firstGate.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(["wt-a:start", "wt-a:end", "wt-b:start", "wt-b:end"]);
  });

  it("allows worktree mutations to stay parallel across linked roots", async () => {
    const coordinator = createGitOperationCoordinator();
    const gate = deferred();
    const started = [];

    const a = coordinator.run(worktreeLockKey("/wt-a"), async () => {
      started.push("a");
      await gate.promise;
    });
    const b = coordinator.run(worktreeLockKey("/wt-b"), async () => {
      started.push("b");
      await gate.promise;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(started.sort()).toEqual(["a", "b"]);
    gate.resolve();
    await Promise.all([a, b]);
  });

  it("allows an idle wait to be cancelled", async () => {
    const coordinator = createGitOperationCoordinator();
    const gate = deferred();
    const key = worktreeLockKey("/repo");
    const operation = coordinator.run(key, () => gate.promise);
    const controller = new AbortController();
    const waiting = coordinator.whenIdle(key, { signal: controller.signal });

    controller.abort();
    await expect(waiting).rejects.toMatchObject({ name: "AbortError" });
    gate.resolve();
    await operation;
  });

  it("waits for every lock key in whenIdleAll", async () => {
    const coordinator = createGitOperationCoordinator();
    const gate = deferred();
    const worktree = worktreeLockKey("/repo");
    const repository = repositoryLockKey("/common");
    const operation = coordinator.run(repository, () => gate.promise);
    let idle = false;
    const waiting = coordinator.whenIdleAll([worktree, repository]).then(() => {
      idle = true;
    });

    await Promise.resolve();
    expect(idle).toBe(false);
    gate.resolve();
    await operation;
    await waiting;
    expect(idle).toBe(true);
  });
});
