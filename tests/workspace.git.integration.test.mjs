// Deep integration tests for the local-mode Git engine (local-api/workspace.mjs).
// Every test runs against a real git repository created in a temp directory:
// real init, real staging, real commits, real branches, real diffs. This covers
// the source-control half of the "端" (desktop/local) product surface.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import {
  initializeWorkspaceGitRepository,
  getWorkspaceGitStatus,
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

describe("repository detection", () => {
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

describe("stage → commit lifecycle", () => {
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
    expect(status.commits[0].message).toMatch(/add app\.js/);
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

describe("diffs", () => {
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
  });

  it("produces an untracked-file diff", async () => {
    await initRepoWithIdentity();
    await createWorkspaceEntry(root, { parentPath: null, name: "new.txt", kind: "file", content: "brand new line\n" });
    const diff = await getWorkspaceGitFileDiff(root, "new.txt", "untracked");
    expect(diff.files.length).toBe(1);
    expect(JSON.stringify(diff.files)).toContain("brand new line");
  });
});

describe("branches", () => {
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

describe("cloud remote configuration (端 → 云 link)", () => {
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
