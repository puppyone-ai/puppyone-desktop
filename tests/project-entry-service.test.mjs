import { access, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProjectEntryService,
  requireGitHubRepository,
  requireProjectName,
} from "../electron/main/project-entry-service.mjs";

let parentPath;

beforeEach(async () => {
  parentPath = await mkdtemp(path.join(os.tmpdir(), "puppyone-project-entry-"));
  parentPath = await realpath(parentPath);
});

afterEach(async () => {
  await rm(parentPath, { recursive: true, force: true });
});

describe("project entry service", () => {
  it("creates one empty child directory under the selected parent", async () => {
    const service = createProjectEntryService();

    await expect(service.createProject({ parentPath, name: "  Notes  " })).resolves.toEqual({
      path: path.join(parentPath, "Notes"),
      name: "Notes",
    });
    expect((await stat(path.join(parentPath, "Notes"))).isDirectory()).toBe(true);
    expect((await readdir(path.join(parentPath, "Notes")))).toEqual([]);
    await expect(service.createProject({ parentPath, name: "Notes" })).rejects.toMatchObject({
      code: "PROJECT_ALREADY_EXISTS",
    });
  });

  it("rejects traversal, reserved names, and malformed GitHub URLs", () => {
    for (const value of ["", ".", "..", "../escape", "bad/name", "CON", "trailing."]) {
      expect(() => requireProjectName(value)).toThrow();
    }
    for (const value of [
      "",
      "https://gitlab.com/owner/repo.git",
      "http://github.com/owner/repo.git",
      "https://token@github.com/owner/repo.git",
      "https://github.com/owner/repo/tree/main",
      "--upload-pack=malicious",
    ]) {
      expect(() => requireGitHubRepository(value)).toThrow();
    }
  });

  it("accepts GitHub HTTPS and SSH forms and derives the local folder name", () => {
    expect(requireGitHubRepository("https://github.com/puppyone-ai/puppyone-desktop.git")).toMatchObject({
      owner: "puppyone-ai",
      name: "puppyone-desktop",
    });
    expect(requireGitHubRepository("git@github.com:puppyone-ai/puppyone-desktop.git")).toMatchObject({
      owner: "puppyone-ai",
      name: "puppyone-desktop",
    });
    expect(requireGitHubRepository("ssh://git@github.com/puppyone-ai/puppyone-desktop.git")).toMatchObject({
      owner: "puppyone-ai",
      name: "puppyone-desktop",
    });
  });

  it("keeps the final path absent while cloning, then publishes the completed result", async () => {
    const cloneGit = vi.fn(async (temporaryPath, repositoryUrl) => {
      expect(path.basename(temporaryPath)).toMatch(/^\.puppyone-clone-repository-/);
      expect(repositoryUrl).toBe("https://github.com/owner/repository.git");
      await expect(access(path.join(parentPath, "repository"))).rejects.toMatchObject({ code: "ENOENT" });
      await writeFile(path.join(temporaryPath, "README.md"), "hello\n", "utf8");
    });
    const service = createProjectEntryService({ cloneGit });

    await expect(service.cloneRepository({
      parentPath,
      repositoryUrl: "https://github.com/owner/repository.git",
    })).resolves.toMatchObject({
      path: path.join(parentPath, "repository"),
      name: "repository",
    });
    await expect(readFile(path.join(parentPath, "repository", "README.md"), "utf8")).resolves.toBe("hello\n");
    expect(cloneGit).toHaveBeenCalledOnce();
  });

  it("does not replace a path created while a clone is running", async () => {
    const service = createProjectEntryService({
      cloneGit: vi.fn(async (temporaryPath) => {
        await writeFile(path.join(temporaryPath, "README.md"), "cloned\n", "utf8");
        await mkdir(path.join(parentPath, "repository"));
        await writeFile(path.join(parentPath, "repository", "keep.txt"), "keep\n", "utf8");
      }),
    });

    await expect(service.cloneRepository({
      parentPath,
      repositoryUrl: "https://github.com/owner/repository.git",
    })).rejects.toMatchObject({ code: "PROJECT_ALREADY_EXISTS" });
    await expect(readFile(path.join(parentPath, "repository", "keep.txt"), "utf8")).resolves.toBe("keep\n");
    expect((await readdir(parentPath)).sort()).toEqual(["repository"]);
  });

  it("removes only its temporary clone directory after a failure", async () => {
    await writeFile(path.join(parentPath, "keep.txt"), "keep", "utf8");
    const service = createProjectEntryService({
      cloneGit: vi.fn(async () => {
        const error = new Error("network unavailable");
        error.stderr = "fatal: repository not found";
        throw error;
      }),
    });

    await expect(service.cloneRepository({
      parentPath,
      repositoryUrl: "https://github.com/owner/repository.git",
    })).rejects.toMatchObject({ code: "CLONE_FAILED" });
    await expect(readFile(path.join(parentPath, "keep.txt"), "utf8")).resolves.toBe("keep");
    const remaining = await readdir(parentPath);
    expect(remaining).toEqual(["keep.txt"]);
  });
});
