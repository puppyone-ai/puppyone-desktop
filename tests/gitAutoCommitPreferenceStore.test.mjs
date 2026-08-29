import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  GIT_AUTO_COMMIT_MIN_INTERVAL_MS,
  createGitAutoCommitPreferenceStore,
} from "../electron/main/git-auto-commit/preference-store.mjs";

const temporaryDirectories = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, {
    recursive: true,
    force: true,
  })));
});

function identity(root) {
  return { repository: true, topLevel: root, gitDir: `${root}/.git`, commonDir: `${root}/.git` };
}

describe("Git Auto Commit preference store", () => {
  it("defaults every consent layer to off and persists only hashed workspace identity", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "puppyone-auto-prefs-"));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "preferences.v1.json");
    const store = createGitAutoCommitPreferenceStore({ filePath });
    const repo = identity(path.join(directory, "private-project-name"));

    expect(await store.getSnapshot(repo)).toMatchObject({
      experimentalOptIn: false,
      workspacePolicy: { enabled: false, scope: "untracked-only" },
    });
    await store.setExperimentalOptIn(true);
    await store.setWorkspacePolicy(repo, { enabled: true, minimumIntervalMs: 1 });

    const snapshot = await store.getSnapshot(repo);
    expect(snapshot.experimentalOptIn).toBe(true);
    expect(snapshot.workspacePolicy).toMatchObject({
      enabled: true,
      minimumIntervalMs: GIT_AUTO_COMMIT_MIN_INTERVAL_MS,
    });
    const persisted = await fs.readFile(filePath, "utf8");
    expect(persisted).not.toContain("private-project-name");
    if (process.platform !== "win32") {
      expect((await fs.stat(filePath)).mode & 0o077).toBe(0);
    }
  });

  it("fails closed for an unsupported schema", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "puppyone-auto-prefs-"));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "preferences.v1.json");
    await fs.writeFile(filePath, JSON.stringify({ schemaVersion: 99, experimentalOptIn: true }), { mode: 0o600 });
    const store = createGitAutoCommitPreferenceStore({ filePath, logger: { warn() {} } });
    expect(await store.getSnapshot()).toMatchObject({ experimentalOptIn: false });
  });
});
