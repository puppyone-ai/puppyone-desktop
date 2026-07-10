// Integration coverage for the Git metadata watch service against real
// temporary repositories. These tests drive external git commands (add,
// commit, ref updates) and assert with eventual predicates that:
//   - the metadata watcher delivers repository invalidations, and
//   - the fast status reader eventually converges on repository truth.
// See docs/architecture/git/status-refresh-lifecycle.md (Work Package 6).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import {
  GIT_REPOSITORY_INVALIDATED_CHANNEL,
  createGitMetadataWatchService,
} from "../electron/main/git-metadata-watch-service.mjs";
import {
  getWorkspaceGitStatus,
  resolveGitRepositoryIdentity,
} from "../local-api/workspace.mjs";

let root;
const services = [];

function git(args) {
  return execFileSync("git", ["-C", root, ...args]).toString().trim();
}

function initRepoWithIdentity() {
  execFileSync("git", ["-C", root, "init"]);
  git(["config", "user.email", "test@puppyone.test"]);
  git(["config", "user.name", "PuppyOne Test"]);
  git(["config", "commit.gpgsign", "false"]);
}

function createRecordingSender(id = 1) {
  const events = [];
  return {
    events,
    sender: {
      id,
      isDestroyed: () => false,
      send: (channel, payload) => events.push({ channel, payload }),
    },
  };
}

function trackService(service) {
  services.push(service);
  return service;
}

async function waitFor(predicate, { timeout = 5000, interval = 40 } = {}) {
  const deadline = Date.now() + timeout;
  let lastError = null;
  for (;;) {
    try {
      const result = await predicate();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    if (Date.now() > deadline) {
      throw lastError ?? new Error("waitFor timed out before predicate was satisfied");
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "puppyone-git-meta-"));
});

afterEach(async () => {
  for (const service of services.splice(0)) {
    service.closeAll();
  }
  await rm(root, { recursive: true, force: true });
});

describe("resolveGitRepositoryIdentity", () => {
  it("returns absolute worktree, git-dir, and common-dir for a repository", async () => {
    initRepoWithIdentity();
    const identity = await resolveGitRepositoryIdentity(root);
    expect(identity.repository).toBe(true);
    expect(path.isAbsolute(identity.gitDir)).toBe(true);
    expect(path.isAbsolute(identity.commonDir)).toBe(true);
    expect(identity.topLevel).toBe(await import("node:fs/promises").then((m) => m.realpath(root)));
  });

  it("reports repository=false for a non-repository folder", async () => {
    const identity = await resolveGitRepositoryIdentity(root);
    expect(identity.repository).toBe(false);
  });
});

describe("git metadata watch service", () => {
  it("delivers a metadata invalidation and converges to a clean snapshot with a new HEAD after an external add + commit", async () => {
    initRepoWithIdentity();
    await writeFile(path.join(root, "tracked.txt"), "one\n");
    git(["add", "tracked.txt"]);
    git(["commit", "-m", "initial commit"]);
    const originalHead = git(["rev-parse", "HEAD"]);

    const service = trackService(createGitMetadataWatchService({ logger: silentLogger() }));
    const { events, sender } = createRecordingSender(1);
    const subscription = await service.start(sender, root);
    expect(subscription.repository).toBe(true);
    expect(typeof subscription.subscriptionId).toBe("string");

    // 1. External edit to a tracked file → repository is dirty.
    await writeFile(path.join(root, "tracked.txt"), "one\ntwo\n");
    await waitFor(async () => {
      const status = await getWorkspaceGitStatus(root);
      return status.unstagedEntries.some((entry) => entry.path === "tracked.txt");
    });

    // 2. External stage → index metadata event.
    git(["add", "tracked.txt"]);
    // 3. External commit → HEAD/refs metadata event and a fresh HEAD.
    git(["commit", "-m", "external commit"]);

    // The metadata watcher must have delivered at least one invalidation.
    await waitFor(() => events.some((event) => event.channel === GIT_REPOSITORY_INVALIDATED_CHANNEL));
    const invalidation = events.find((event) => event.channel === GIT_REPOSITORY_INVALIDATED_CHANNEL);
    expect(invalidation.payload.subscriptionId).toBe(subscription.subscriptionId);
    expect(invalidation.payload.rootPath).toBeTruthy();
    expect(typeof invalidation.payload.reason).toBe("string");

    // The fast status reader eventually reflects repository truth: clean tree,
    // new HEAD commit.
    const finalHead = git(["rev-parse", "HEAD"]);
    expect(finalHead).not.toBe(originalHead);
    await waitFor(async () => {
      const status = await getWorkspaceGitStatus(root);
      return status.entries.length === 0 && status.headCommitId === finalHead;
    });

    service.stop(subscription.subscriptionId);
    expect(service.getWatcherCount()).toBe(0);
  });

  it("reference-counts one watcher per repository identity and cleans up by subscription id", async () => {
    initRepoWithIdentity();
    await writeFile(path.join(root, "a.txt"), "a\n");
    git(["add", "a.txt"]);
    git(["commit", "-m", "init"]);

    const service = trackService(createGitMetadataWatchService({ logger: silentLogger() }));
    const first = createRecordingSender(1);
    const second = createRecordingSender(2);
    const subA = await service.start(first.sender, root);
    const subB = await service.start(second.sender, root);

    expect(subA.subscriptionId).not.toBe(subB.subscriptionId);
    expect(service.getWatcherCount()).toBe(1);

    service.stop(subA.subscriptionId);
    expect(service.getWatcherCount()).toBe(1);
    service.stop(subB.subscriptionId);
    expect(service.getWatcherCount()).toBe(0);
  });

  it("re-arms and keeps reporting after a ref-only update (branch switch on identical trees)", async () => {
    initRepoWithIdentity();
    await writeFile(path.join(root, "a.txt"), "a\n");
    git(["add", "a.txt"]);
    git(["commit", "-m", "init"]);

    const service = trackService(createGitMetadataWatchService({ logger: silentLogger() }));
    const { events, sender } = createRecordingSender(3);
    const subscription = await service.start(sender, root);
    const baseline = events.length;

    git(["checkout", "-b", "feature"]);

    await waitFor(() => events.length > baseline
      && events.some((event) => event.channel === GIT_REPOSITORY_INVALIDATED_CHANNEL));

    const status = await getWorkspaceGitStatus(root);
    expect(status.branch).toBe("feature");
    service.stop(subscription.subscriptionId);
  });

  it("invalidates on external stage/unstage without another working-tree edit", async () => {
    initRepoWithIdentity();
    await writeFile(path.join(root, "tracked.txt"), "one\n");
    git(["add", "tracked.txt"]);
    git(["commit", "-m", "init"]);
    await writeFile(path.join(root, "tracked.txt"), "one\ntwo\n");

    const service = trackService(createGitMetadataWatchService({ logger: silentLogger() }));
    const { events, sender } = createRecordingSender(4);
    const subscription = await service.start(sender, root);
    const baseline = events.length;

    git(["add", "tracked.txt"]);
    await waitFor(
      () => events.length > baseline
        && events.some((event) => event.channel === GIT_REPOSITORY_INVALIDATED_CHANNEL),
      { timeout: 8000 },
    );
    await waitFor(async () => {
      const status = await getWorkspaceGitStatus(root);
      return status.stagedEntries.some((entry) => entry.path === "tracked.txt");
    }, { timeout: 8000 });

    const afterStage = events.length;
    git(["reset", "HEAD", "--", "tracked.txt"]);
    await waitFor(
      () => events.length > afterStage
        && events.some((event, index) => index >= afterStage && event.channel === GIT_REPOSITORY_INVALIDATED_CHANNEL),
      { timeout: 8000 },
    );
    await waitFor(async () => {
      const status = await getWorkspaceGitStatus(root);
      return status.unstagedEntries.some((entry) => entry.path === "tracked.txt")
        && status.stagedEntries.length === 0;
    }, { timeout: 8000 });

    service.stop(subscription.subscriptionId);
  }, 20000);

  it("invalidates on external reset --soft", async () => {
    initRepoWithIdentity();
    await writeFile(path.join(root, "tracked.txt"), "one\n");
    git(["add", "tracked.txt"]);
    git(["commit", "-m", "first"]);
    await writeFile(path.join(root, "tracked.txt"), "two\n");
    git(["add", "tracked.txt"]);
    git(["commit", "-m", "second"]);
    const headBefore = git(["rev-parse", "HEAD"]);

    const service = trackService(createGitMetadataWatchService({ logger: silentLogger() }));
    const { events, sender } = createRecordingSender(5);
    const subscription = await service.start(sender, root);
    const baseline = events.length;

    git(["reset", "--soft", "HEAD~1"]);
    await waitFor(() => events.length > baseline);
    await waitFor(async () => {
      const status = await getWorkspaceGitStatus(root);
      return status.headCommitId !== headBefore
        && status.stagedEntries.some((entry) => entry.path === "tracked.txt");
    });

    service.stop(subscription.subscriptionId);
  });
});

function silentLogger() {
  return { warn: () => {}, info: () => {}, error: () => {} };
}
