import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createGitAutoCommitOperationLease } from "../electron/main/git-auto-commit/operation-lease.mjs";

const roots = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("Git Auto Commit cross-process lease", () => {
  it("elects one owner through the shared Git common directory", async () => {
    const fixture = await createIdentity();
    const first = createGitAutoCommitOperationLease();
    const second = createGitAutoCommitOperationLease();
    const held = await first.acquire(fixture.identity);

    await expect(second.acquire({ ...fixture.identity, gitDir: path.join(fixture.root, "linked-git") }))
      .resolves.toBeNull();
    const leasePath = path.join(fixture.identity.commonDir, "puppyone", "auto-commit.lease.json");
    expect(JSON.parse(await fs.readFile(leasePath, "utf8"))).toMatchObject({ pid: process.pid });

    await held.release();
    const next = await second.acquire(fixture.identity);
    expect(next).not.toBeNull();
    await next.release();
  });

  it("uses token fencing so an old owner cannot remove a replacement lease", async () => {
    const fixture = await createIdentity();
    const held = await createGitAutoCommitOperationLease().acquire(fixture.identity);
    const leasePath = path.join(fixture.identity.commonDir, "puppyone", "auto-commit.lease.json");
    const replacement = {
      version: 1,
      owner_token: "replacement-owner",
      pid: process.pid,
      acquired_at: new Date().toISOString(),
    };
    await fs.writeFile(leasePath, `${JSON.stringify(replacement)}\n`, { mode: 0o600 });

    await held.release();
    expect(JSON.parse(await fs.readFile(leasePath, "utf8")).owner_token).toBe("replacement-owner");
  });
});

async function createIdentity() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "puppyone-auto-lease-"));
  roots.push(root);
  const commonDir = path.join(root, "common-git");
  const gitDir = path.join(root, "worktree-git");
  await fs.mkdir(commonDir, { recursive: true });
  await fs.mkdir(gitDir, { recursive: true });
  return {
    root,
    identity: { repository: true, workspaceRoot: root, topLevel: root, gitDir, commonDir },
  };
}
