// Deep integration tests for the local-mode Git engine (local-api/workspace.mjs).
// Every test runs against a real git repository created in a temp directory:
// real init, real staging, real commits, real branches, real diffs. This covers
// the source-control half of the "端" (desktop/local) product surface.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile, symlink } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import {
  initializeWorkspaceGitRepository,
  getWorkspaceGitStatus,
  getWorkspaceGitBranchGraph,
  stageAllWorkspaceGitChanges,
  stageWorkspaceGitPaths,
  commitWorkspaceGit,
  createWorkspaceGitBranch,
  checkoutWorkspaceGitBranch,
  getWorkspaceGitFileDiff,
  configureWorkspaceCloudRemote,
  createWorkspaceEntry,
  writeWorkspaceTextFile,
} from "../local-api/workspace.mjs";

let root;

async function initRepoWithIdentity() {
  await initializeWorkspaceGitRepository(root);
  // Commits need an author identity + no GPG signing in CI/temp repos.
  execFileSync("git", ["-C", root, "config", "user.email", "test@puppyone.test"]);
  execFileSync("git", ["-C", root, "config", "user.name", "PuppyOne Test"]);
  execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);
}

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "puppyone-git-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("repository detection", { timeout: 20_000 }, () => {
  it("reports a non-repo folder as isRepo=false with zero commits", async () => {
    const status = await getWorkspaceGitStatus(root);
    expect(status.isRepo).toBe(false);
    expect(status.totalCommits).toBe(0);
    expect(status.entries).toEqual([]);
    expect(status.branches).toEqual([]);
  });

  it("initializes a repository", async () => {
    const status = await initializeWorkspaceGitRepository(root);
    expect(status.isRepo).toBe(true);
    expect(typeof status.branch).toBe("string");
    expect(status.branch.length).toBeGreaterThan(0);
    expect(status.totalCommits).toBe(0);
  });
});

describe("stage → commit lifecycle", { timeout: 20_000 }, () => {
  it("tracks a new file as untracked, then staged, then committed", async () => {
    await initRepoWithIdentity();
    await createWorkspaceEntry(root, { parentPath: null, name: "app.js", kind: "file", content: "console.log(1)\n" });

    let status = await getWorkspaceGitStatus(root);
    expect(status.untrackedEntries.length).toBeGreaterThan(0);
    expect(status.untrackedEntries.some((e) => e.path === "app.js")).toBe(true);

    await stageAllWorkspaceGitChanges(root);
    status = await getWorkspaceGitStatus(root);
    expect(status.stagedEntries.some((e) => e.path === "app.js")).toBe(true);
    expect(status.untrackedEntries.length).toBe(0);

    status = await commitWorkspaceGit(root, "feat: add app.js");
    expect(status.totalCommits).toBe(1);
    expect(status.headCommitId).toBeTruthy();
    expect(status.entries).toEqual([]);
    // The fast status path no longer loads history; commit messages come from
    // the lazily-loaded branch graph (getWorkspaceGitBranchGraph).
    const graph = await getWorkspaceGitBranchGraph(root);
    expect(graph.commits[0].message).toMatch(/add app\.js/);
  });

  it("detects modifications to a committed file as unstaged", async () => {
    await initRepoWithIdentity();
    await createWorkspaceEntry(root, { parentPath: null, name: "data.txt", kind: "file", content: "one\n" });
    await stageAllWorkspaceGitChanges(root);
    await commitWorkspaceGit(root, "init");

    await writeWorkspaceTextFile(root, "data.txt", "one\ntwo\n");
    const status = await getWorkspaceGitStatus(root);
    expect(status.unstagedEntries.some((e) => e.path === "data.txt")).toBe(true);
  });

  it("stages a specific path and makes a second commit", async () => {
    await initRepoWithIdentity();
    await createWorkspaceEntry(root, { parentPath: null, name: "a.txt", kind: "file", content: "a" });
    await stageAllWorkspaceGitChanges(root);
    await commitWorkspaceGit(root, "first");

    await createWorkspaceEntry(root, { parentPath: null, name: "b.txt", kind: "file", content: "b" });
    await stageWorkspaceGitPaths(root, ["b.txt"]);
    const status = await commitWorkspaceGit(root, "second");
    expect(status.totalCommits).toBe(2);
  });
});

describe("diffs", { timeout: 20_000 }, () => {
  it("produces a working-tree diff for a modified tracked file", async () => {
    await initRepoWithIdentity();
    await createWorkspaceEntry(root, { parentPath: null, name: "code.js", kind: "file", content: "const x = 1\n" });
    await stageAllWorkspaceGitChanges(root);
    await commitWorkspaceGit(root, "init");

    await writeWorkspaceTextFile(root, "code.js", "const x = 2\n");
    const diff = await getWorkspaceGitFileDiff(root, "code.js", "unstaged");
    expect(diff.commit_id).toBe("working-tree");
    expect(diff.files.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(diff.files)).toContain("const x = 2");
    expect(diff.files[0].revisionPair).toMatchObject({
      scope: "unstaged",
      before: { kind: "text", content: "const x = 1\n" },
      after: { kind: "text", content: "const x = 2\n" },
    });
    expect(diff.files[0].revisionPair.before.identity).toMatch(/^git:/);
    expect(diff.files[0].revisionPair.after.identity).toMatch(/^worktree:/);
  });

  it("produces an untracked-file diff", async () => {
    await initRepoWithIdentity();
    await createWorkspaceEntry(root, { parentPath: null, name: "new.txt", kind: "file", content: "brand new line\n" });
    const diff = await getWorkspaceGitFileDiff(root, "new.txt", "untracked");
    expect(diff.files.length).toBe(1);
    expect(JSON.stringify(diff.files)).toContain("brand new line");
    expect(diff.files[0].revisionPair).toMatchObject({
      before: { kind: "missing" },
      after: { kind: "text", content: "brand new line\n" },
    });
  });

  it("models staged deletions and renames with immutable Git identities", async () => {
    await initRepoWithIdentity();
    await writeFile(path.join(root, "old.txt"), "old value\n");
    await writeFile(path.join(root, "delete.txt"), "remove me\n");
    await stageAllWorkspaceGitChanges(root);
    await commitWorkspaceGit(root, "base");

    execFileSync("git", ["-C", root, "mv", "old.txt", "next.txt"]);
    await rm(path.join(root, "delete.txt"));
    await stageAllWorkspaceGitChanges(root);

    const renamed = await getWorkspaceGitFileDiff(root, "next.txt", "staged");
    expect(renamed.files[0]).toMatchObject({ status: "renamed", oldPath: "old.txt", path: "next.txt" });
    expect(renamed.files[0].revisionPair).toMatchObject({
      before: { kind: "text", content: "old value\n" },
      after: { kind: "text", content: "old value\n" },
    });
    expect(renamed.files[0].revisionPair.before.identity).toMatch(/^git:/);
    expect(renamed.files[0].revisionPair.after.identity).toMatch(/^git:/);

    const deleted = await getWorkspaceGitFileDiff(root, "delete.txt", "staged");
    expect(deleted.files[0].revisionPair).toMatchObject({
      before: { kind: "text", content: "remove me\n" },
      after: { kind: "missing" },
    });
  });

  it("returns an honest unavailable side for over-budget binary resources and honors cancellation", async () => {
    await initRepoWithIdentity();
    await writeFile(path.join(root, "large.bin"), Buffer.alloc((25 * 1024 * 1024) + 1, 7));
    const detail = await getWorkspaceGitFileDiff(root, "large.bin", "untracked");
    expect(detail.files[0].revisionPair.after).toMatchObject({
      kind: "unavailable",
      reason: "size-limit",
    });

    const controller = new AbortController();
    controller.abort();
    await expect(getWorkspaceGitFileDiff(root, "large.bin", "untracked", {
      signal: controller.signal,
    })).rejects.toMatchObject({ name: "AbortError" });
  });

  it("materializes a small binary revision as bounded internal resource bytes", async () => {
    await initRepoWithIdentity();
    const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff, 0x01]);
    await writeFile(path.join(root, "report.docx"), bytes);
    const detail = await getWorkspaceGitFileDiff(root, "report.docx", "untracked");
    expect(detail.files[0].revisionPair.before).toMatchObject({ kind: "missing" });
    expect(detail.files[0].revisionPair.after).toMatchObject({
      kind: "resource",
      size: bytes.length,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    expect(detail.files[0].revisionPair.after.identity).toMatch(/^worktree:/);
    expect(detail.files[0].revisionPair.after.bytes).toEqual(bytes);
  });

  it("refuses to read an untracked symbolic link outside the workspace", async () => {
    await initRepoWithIdentity();
    const external = await mkdtemp(path.join(os.tmpdir(), "puppyone-git-external-"));
    try {
      const secretPath = path.join(external, "secret.txt");
      await writeFile(secretPath, "outside secret\n");
      await symlink(secretPath, path.join(root, "linked.txt"));
      await expect(getWorkspaceGitFileDiff(root, "linked.txt", "untracked"))
        .rejects.toThrow(/symbolic links|workspace entry/i);
    } finally {
      await rm(external, { recursive: true, force: true });
    }
  });

  it("derives committed and remote revision pairs from trusted refs", async () => {
    await initRepoWithIdentity();
    await writeFile(path.join(root, "shared.txt"), "base\n");
    await stageAllWorkspaceGitChanges(root);
    await commitWorkspaceGit(root, "base");

    const remoteRoot = await mkdtemp(path.join(os.tmpdir(), "puppyone-git-remote-"));
    const peerRoot = await mkdtemp(path.join(os.tmpdir(), "puppyone-git-peer-"));
    try {
      execFileSync("git", ["init", "--bare", remoteRoot]);
      execFileSync("git", ["-C", root, "remote", "add", "origin", remoteRoot]);
      const branch = execFileSync("git", ["-C", root, "branch", "--show-current"]).toString().trim();
      execFileSync("git", ["-C", root, "push", "-u", "origin", branch]);

      execFileSync("git", ["clone", "--branch", branch, remoteRoot, peerRoot]);
      execFileSync("git", ["-C", peerRoot, "config", "user.email", "peer@puppyone.test"]);
      execFileSync("git", ["-C", peerRoot, "config", "user.name", "PuppyOne Peer"]);
      await writeFile(path.join(peerRoot, "shared.txt"), "remote revision\n");
      execFileSync("git", ["-C", peerRoot, "add", "shared.txt"]);
      execFileSync("git", ["-C", peerRoot, "commit", "-m", "remote change"]);
      execFileSync("git", ["-C", peerRoot, "push", "origin", branch]);

      await writeFile(path.join(root, "shared.txt"), "local revision\n");
      await stageAllWorkspaceGitChanges(root);
      await commitWorkspaceGit(root, "local change");
      execFileSync("git", ["-C", root, "fetch", "origin"]);

      const committed = await getWorkspaceGitFileDiff(root, "shared.txt", "committed");
      expect(committed.files[0].revisionPair).toMatchObject({
        scope: "committed",
        before: { kind: "text", content: "base\n" },
        after: { kind: "text", content: "local revision\n" },
      });
      expect(committed.files[0].revisionPair.before.identity).toMatch(/^git:/);
      expect(committed.files[0].revisionPair.after.identity).toMatch(/^git:/);

      const remote = await getWorkspaceGitFileDiff(root, "shared.txt", "remote");
      expect(remote.files[0].revisionPair).toMatchObject({
        scope: "remote",
        before: { kind: "text", content: "base\n" },
        after: { kind: "text", content: "remote revision\n" },
      });
      expect(remote.files[0].revisionPair.selectionIdentity)
        .not.toBe(committed.files[0].revisionPair.selectionIdentity);
    } finally {
      await rm(peerRoot, { recursive: true, force: true });
      await rm(remoteRoot, { recursive: true, force: true });
    }
  });
});

describe("branches", { timeout: 20_000 }, () => {
  it("creates and checks out a branch", async () => {
    await initRepoWithIdentity();
    await createWorkspaceEntry(root, { parentPath: null, name: "x.txt", kind: "file", content: "x" });
    await stageAllWorkspaceGitChanges(root);
    await commitWorkspaceGit(root, "init");

    await createWorkspaceGitBranch(root, "feature/login");
    const status = await checkoutWorkspaceGitBranch(root, "feature/login");
    expect(status.branch).toBe("feature/login");
    expect(status.branches.some((b) => b.name === "feature/login")).toBe(true);
  });

  it("rejects an invalid branch name (leading dash / bad ref)", async () => {
    await initRepoWithIdentity();
    await createWorkspaceEntry(root, { parentPath: null, name: "x.txt", kind: "file", content: "x" });
    await stageAllWorkspaceGitChanges(root);
    await commitWorkspaceGit(root, "init");

    await expect(createWorkspaceGitBranch(root, "-rf")).rejects.toThrow(/invalid/i);
    await expect(createWorkspaceGitBranch(root, "bad..name")).rejects.toThrow(/invalid/i);
  });
});

describe("cloud remote configuration (端 → 云 link)", { timeout: 20_000 }, () => {
  it("configures a PuppyOne-shaped git remote", async () => {
    await initRepoWithIdentity();
    const status = await configureWorkspaceCloudRemote(
      root,
      "https://api.puppyone.ai/git/my-project.git",
      "puppyone",
    );
    expect(status.remotes.some((r) => r.name === "puppyone")).toBe(true);
    const url = execFileSync("git", ["-C", root, "remote", "get-url", "puppyone"]).toString().trim();
    expect(url).toBe("https://api.puppyone.ai/git/my-project.git");
  });

  it("updates the URL when the remote already exists (set-url)", async () => {
    await initRepoWithIdentity();
    await configureWorkspaceCloudRemote(root, "https://api.puppyone.ai/git/one.git", "puppyone");
    await configureWorkspaceCloudRemote(root, "https://api.puppyone.ai/git/two.git", "puppyone");
    const url = execFileSync("git", ["-C", root, "remote", "get-url", "puppyone"]).toString().trim();
    expect(url).toBe("https://api.puppyone.ai/git/two.git");
  });

  it("rejects a URL whose path is not a /git/<name>.git endpoint", async () => {
    await initRepoWithIdentity();
    await expect(
      configureWorkspaceCloudRemote(root, "https://example.com/repo.git", "puppyone"),
    ).rejects.toThrow(/PuppyOne Git endpoint/i);
  });

  it("rejects non-http(s) remote URLs", async () => {
    await initRepoWithIdentity();
    await expect(
      configureWorkspaceCloudRemote(root, "ftp://api.puppyone.ai/git/x.git", "puppyone"),
    ).rejects.toThrow(/http or https/i);
  });

  it("rejects an invalid remote name (leading dash)", async () => {
    await initRepoWithIdentity();
    await expect(
      configureWorkspaceCloudRemote(root, "https://api.puppyone.ai/git/x.git", "-evil"),
    ).rejects.toThrow(/Remote name is invalid/i);
  });
});

describe("fast status vs lazy history", { timeout: 20_000 }, () => {
  it("keeps frequent status free of history while branch graph still loads commits", async () => {
    await initRepoWithIdentity();
    await createWorkspaceEntry(root, { parentPath: null, name: "app.js", kind: "file", content: "console.log(1)\n" });
    await stageAllWorkspaceGitChanges(root);
    await commitWorkspaceGit(root, "feat: add app.js");

    const status = await getWorkspaceGitStatus(root);
    expect(status.isRepo).toBe(true);
    expect(status.commits).toEqual([]);
    expect(status.allCommits).toEqual([]);
    expect(status.totalCommits).toBe(1);

    const graph = await getWorkspaceGitBranchGraph(root);
    expect(graph.commits[0].message).toMatch(/add app\.js/);
    expect(graph.allCommits.length).toBeGreaterThan(0);
  });

  it("keeps working-tree refreshes free of history while HEAD stays stable", async () => {
    await initRepoWithIdentity();
    await createWorkspaceEntry(root, { parentPath: null, name: "app.js", kind: "file", content: "console.log(1)\n" });
    await stageAllWorkspaceGitChanges(root);
    await commitWorkspaceGit(root, "feat: add app.js");

    const graph = await getWorkspaceGitBranchGraph(root);
    expect(graph.commits.length).toBeGreaterThan(0);

    await writeWorkspaceTextFile(root, "app.js", "console.log(2)\n");
    const status = await getWorkspaceGitStatus(root);
    expect(status.commits).toEqual([]);
    expect(status.headCommitId).toBe(graph.headCommitId);
    expect(status.unstagedEntries.some((entry) => entry.path === "app.js")).toBe(true);
  });

  it("returns a bounded status snapshot and reports truncation", async () => {
    await initRepoWithIdentity();
    for (const name of ["one.txt", "two.txt", "three.txt", "four.txt"]) {
      await createWorkspaceEntry(root, { parentPath: null, name, kind: "file", content: `${name}\n` });
    }

    const status = await getWorkspaceGitStatus(root, { statusEntryLimit: 2 });
    expect(status.entries).toHaveLength(2);
    expect(status.statusLimit).toBe(2);
    expect(status.didHitStatusLimit).toBe(true);
  });

  it("honors an already-cancelled status request", async () => {
    await initRepoWithIdentity();
    const controller = new AbortController();
    controller.abort();
    await expect(getWorkspaceGitStatus(root, { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("changes the consistency fingerprint when HEAD or the index changes", async () => {
    const { readGitConsistencyFingerprint } = await import("../local-api/workspace.mjs");
    await initRepoWithIdentity();
    await createWorkspaceEntry(root, { parentPath: null, name: "app.js", kind: "file", content: "one\n" });
    await stageAllWorkspaceGitChanges(root);
    await commitWorkspaceGit(root, "first");

    const before = await readGitConsistencyFingerprint(root);
    await writeWorkspaceTextFile(root, "app.js", "two\n");
    await stageAllWorkspaceGitChanges(root);
    const afterIndex = await readGitConsistencyFingerprint(root);
    expect(afterIndex).not.toBe(before);

    await commitWorkspaceGit(root, "second");
    const afterHead = await readGitConsistencyFingerprint(root);
    expect(afterHead).not.toBe(afterIndex);
  });

  it("still reports untracked files when status.showUntrackedFiles=no", async () => {
    await initRepoWithIdentity();
    execFileSync("git", ["-C", root, "config", "status.showUntrackedFiles", "no"]);
    await writeFile(path.join(root, "missing.txt"), "hidden-by-config\n");

    const status = await getWorkspaceGitStatus(root);
    expect(status.entries.some((entry) => entry.path === "missing.txt")).toBe(true);
    expect(status.untrackedEntries.some((entry) => entry.path === "missing.txt")).toBe(true);
  });

  it("allows a slow pre-commit hook beyond the read timeout", async () => {
    await initRepoWithIdentity();
    await createWorkspaceEntry(root, { parentPath: null, name: "hooked.js", kind: "file", content: "ok\n" });
    await stageAllWorkspaceGitChanges(root);

    const hookDir = path.join(root, ".git", "hooks");
    await writeFile(
      path.join(hookDir, "pre-commit"),
      "#!/bin/sh\nsleep 6\nexit 0\n",
      { mode: 0o755 },
    );

    const started = Date.now();
    const status = await commitWorkspaceGit(root, "slow hook commit");
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThan(5_500);
    expect(status.entries).toEqual([]);
    expect(status.totalCommits).toBeGreaterThan(0);
  }, 30_000);
});
