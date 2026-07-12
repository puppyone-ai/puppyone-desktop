import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceStateStore } from "../electron/main/workspace-state-store.mjs";

let root;

beforeEach(async () => {
  root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "puppyone-workspace-registry-"));
});

afterEach(async () => {
  await fs.promises.rm(root, { recursive: true, force: true });
});

describe("workspace registry lifecycle", () => {
  it("serializes concurrent multi-window mutations without losing records", async () => {
    const store = createStore();
    const folders = await Promise.all(Array.from({ length: 12 }, async (_, index) => {
      const folder = path.join(root, `workspace-${index}`);
      await fs.promises.mkdir(folder);
      return folder;
    }));

    await Promise.all(folders.map((folder) => store.rememberRecentWorkspacePath(folder)));
    const result = await store.getRecentWorkspacesResult();

    expect(result.items).toHaveLength(12);
    expect(new Set(result.items.map((item) => item.workspace.workspaceInstanceId)).size).toBe(12);
    const raw = JSON.parse(await fs.promises.readFile(path.join(root, "registry.json"), "utf8"));
    expect(raw.version).toBe(2);
    expect(raw.recentWorkspaces).toHaveLength(12);
  });

  it("serializes interleaved remember and remove mutations without resurrecting removed records", async () => {
    const store = createStore();
    const original = await createFolders("original", 8);
    const added = await createFolders("added", 8);
    await Promise.all(original.map((folder) => store.rememberRecentWorkspacePath(folder)));

    await Promise.all([
      ...original.slice(0, 4).map((folder) => store.removeRecentWorkspacePath(folder)),
      ...added.map((folder) => store.rememberRecentWorkspacePath(folder)),
    ]);

    const result = await store.getRecentWorkspacesResult();
    const paths = new Set(result.items.map((item) => item.workspace.path));
    const removedPaths = await Promise.all(original.slice(0, 4).map((folder) => fs.promises.realpath(folder)));
    const retainedPaths = await Promise.all(original.slice(4).map((folder) => fs.promises.realpath(folder)));
    const addedPaths = await Promise.all(added.map((folder) => fs.promises.realpath(folder)));
    expect(paths.size).toBe(12);
    for (const removed of removedPaths) expect(paths.has(removed)).toBe(false);
    for (const retained of retainedPaths) expect(paths.has(retained)).toBe(true);
    for (const folder of addedPaths) expect(paths.has(folder)).toBe(true);
  });

  it("deduplicates a symlink alias of the same physical workspace", async () => {
    const store = createStore();
    const workspace = path.join(root, "physical-workspace");
    const alias = path.join(root, "workspace-alias");
    await fs.promises.mkdir(workspace);
    try {
      await fs.promises.symlink(workspace, alias, "dir");
    } catch {
      return;
    }

    await store.rememberRecentWorkspacePath(workspace);
    await store.rememberRecentWorkspacePath(alias);

    const result = await store.getRecentWorkspacesResult();
    expect(result.items).toHaveLength(1);
    expect(result.items[0].workspace.path).toBe(await fs.promises.realpath(workspace));
  });

  it("reconciles a moved path by fs identity instead of duplicating the workspace", async () => {
    const identities = new Map();
    const store = createStore({
      resolveWorkspaceIdentity: async (folderPath) => ({
        canonicalPath: folderPath,
        workspaceInstanceId: identities.get(folderPath) ?? "instance-1",
        fsIdentity: "fs:1:99",
        projectId: "project-1",
      }),
    });
    const before = path.join(root, "before");
    const after = path.join(root, "after");
    await fs.promises.mkdir(before);
    await store.rememberRecentWorkspacePath(before);
    await fs.promises.rename(before, after);
    await store.rememberRecentWorkspacePath(after);

    const result = await store.getRecentWorkspacesResult();
    expect(result.items).toHaveLength(1);
    expect(result.items[0].workspace.path).toBe(await fs.promises.realpath(after));
    expect(result.items[0].workspace.projectId).toBe("project-1");
  });

  it("persists and clears the main-owned Cloud binding hint without granting renderer authority", async () => {
    let cloudProjectId = "cloud-project-1";
    const store = createStore({
      resolveWorkspaceIdentity: async (folderPath) => ({
        canonicalPath: folderPath,
        workspaceInstanceId: "instance-cloud",
        fsIdentity: "fs:1:100",
        projectId: "project-identity",
        cloudProjectId,
      }),
    });
    const folder = path.join(root, "cloud-linked");
    await fs.promises.mkdir(folder);

    await store.rememberRecentWorkspacePath(folder);
    expect((await store.getRecentWorkspacesResult()).items[0].workspace.cloudProjectId).toBe("cloud-project-1");

    cloudProjectId = null;
    await store.rememberRecentWorkspacePath(folder);
    expect((await store.getRecentWorkspacesResult()).items[0].workspace.cloudProjectId).toBeNull();
  });

  it("quarantines corrupt JSON and reports a recoverable registry error", async () => {
    await fs.promises.writeFile(path.join(root, "registry.json"), "{broken", "utf8");
    const store = createStore();

    const result = await store.getRecentWorkspacesResult();

    expect(result.workspaces).toEqual([]);
    expect(result.errors[0].error).toMatch(/corrupt/i);
    expect(await fs.promises.readdir(root)).toContainEqual(
      expect.stringMatching(/^registry\.json\.corrupt\./),
    );
  });

  it("returns metadata immediately and hydrates at most four repositories concurrently", async () => {
    let active = 0;
    let peak = 0;
    const workspaceFromPath = vi.fn(async (folderPath) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setImmediate(resolve));
      active -= 1;
      return createWorkspace(folderPath);
    });
    const store = createStore({ workspaceFromPath });
    const folders = await Promise.all(Array.from({ length: 10 }, async (_, index) => {
      const folder = path.join(root, `repo-${index}`);
      await fs.promises.mkdir(folder);
      return folder;
    }));
    await Promise.all(folders.map((folder) => store.rememberRecentWorkspacePath(folder)));

    const metadata = await store.getRecentWorkspacesResult();
    expect(metadata.hydrated).toBe(false);
    expect(workspaceFromPath).not.toHaveBeenCalled();

    const hydrated = await store.hydrateRecentWorkspacesResult();
    expect(hydrated.workspaces).toHaveLength(10);
    expect(peak).toBeLessThanOrEqual(4);
  });
});

function createStore(overrides = {}) {
  const resolveWorkspaceIdentity = overrides.resolveWorkspaceIdentity ?? (async (folderPath) => ({
    canonicalPath: folderPath,
    workspaceInstanceId: `instance-${path.basename(folderPath)}`,
    fsIdentity: `fs-${path.basename(folderPath)}`,
    projectId: null,
  }));
  return createWorkspaceStateStore({
    app: { getPath: () => root },
    filename: "registry.json",
    canonicalizeWorkspacePath: async (value) => fs.promises.realpath(path.resolve(value)),
    resolveWorkspaceIdentity,
    workspaceFromPath: overrides.workspaceFromPath ?? (async (folderPath) => createWorkspace(folderPath)),
    logger: { warn: vi.fn() },
  });
}

function createWorkspace(folderPath) {
  return {
    id: `local:instance-${path.basename(folderPath)}`,
    name: path.basename(folderPath),
    path: folderPath,
    status: "protected",
    cloudState: "local",
    commitCount: 0,
    hydrationState: "ready",
  };
}

async function createFolders(prefix, count) {
  return Promise.all(Array.from({ length: count }, async (_, index) => {
    const folder = path.join(root, `${prefix}-${index}`);
    await fs.promises.mkdir(folder);
    return folder;
  }));
}
