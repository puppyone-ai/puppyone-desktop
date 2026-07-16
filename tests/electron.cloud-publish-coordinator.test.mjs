import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCloudPublishCoordinator } from "../electron/main/cloud-publish-coordinator.mjs";

const execFileAsync = promisify(execFile);
const roots = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Cloud publish coordinator", () => {
  it("creates once, keeps the credential out of the journal, and maps a feature branch to Cloud main", async () => {
    const fixture = await createFixture("feature/design");
    const coordinator = createCoordinator(fixture);

    const result = await coordinator.startOrResume(fixture.request);

    expect(result.ok).toBe(true);
    expect(result.state).toMatchObject({ phase: "completed", destinationBranch: "main" });
    expect(fixture.cloud.requests.filter((entry) => entry.path === "/projects/")).toHaveLength(1);
    expect(await git(fixture.root, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"))
      .toBe("puppyone/main");
    expect(await git(fixture.bare, "rev-parse", "refs/heads/main")).toBe(fixture.head);
    const gitDir = await git(fixture.root, "rev-parse", "--absolute-git-dir");
    await expect(readFile(path.join(gitDir, "puppyone", "pending-cloud-publish.v1.json"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
    expect([...fixture.vault.values()].join("\n")).not.toContain("pwg_");
  });

  it("recovers after a crash immediately after remote add without creating another Project", async () => {
    const fixture = await createFixture("main");
    const crash = new Error("simulated crash");
    crash.simulateCrash = true;
    const first = createCoordinator(fixture, {
      faultInjector: async (point) => {
        if (point === "after-remote-add") throw crash;
      },
    });

    await expect(first.startOrResume(fixture.request)).rejects.toBe(crash);
    expect(await git(fixture.root, "remote", "get-url", "puppyone")).toBe(fixture.bare);

    const resumed = await createCoordinator(fixture).startOrResume(fixture.request);
    expect(resumed.ok).toBe(true);
    expect(fixture.cloud.requests.filter((entry) => entry.path === "/projects/")).toHaveLength(1);
    expect(await git(fixture.bare, "rev-parse", "refs/heads/main")).toBe(fixture.head);
  });

  it("fails closed when a pending operation finds the canonical remote at a different URL", async () => {
    const fixture = await createFixture("main");
    const crash = new Error("pause after Project");
    crash.simulateCrash = true;
    const first = createCoordinator(fixture, {
      faultInjector: async (point) => {
        if (point === "after-project-created") throw crash;
      },
    });
    await expect(first.startOrResume(fixture.request)).rejects.toBe(crash);
    await git(fixture.root, "remote", "add", "puppyone", `${fixture.bare}-wrong`);

    const result = await createCoordinator(fixture).startOrResume(fixture.request);
    expect(result).toMatchObject({ ok: false, error: { code: "REMOTE_CONFLICT", retryable: false } });
    expect(await git(fixture.root, "remote", "get-url", "puppyone")).toBe(`${fixture.bare}-wrong`);
  });

  it("singleflights concurrent retries under the repository mutation lock", async () => {
    const fixture = await createFixture("main");
    let release;
    fixture.cloud.projectGate = new Promise((resolve) => { release = resolve; });
    const coordinator = createCoordinator(fixture);
    const first = coordinator.startOrResume(fixture.request);
    const second = coordinator.startOrResume(fixture.request);
    await vi.waitFor(() => {
      expect(fixture.cloud.requests.filter((entry) => entry.path === "/projects/")).toHaveLength(1);
    });
    release();
    const [left, right] = await Promise.all([first, second]);
    expect(left.ok).toBe(true);
    expect(right.ok).toBe(true);
    expect(fixture.cloud.requests.filter((entry) => entry.path === "/projects/")).toHaveLength(1);
  });
});

async function createFixture(branch) {
  const root = await mkdtemp(path.join(os.tmpdir(), "puppyone-publish-root-"));
  const bare = await mkdtemp(path.join(os.tmpdir(), "puppyone-publish-bare-"));
  roots.push(root, bare);
  await git(root, "init", "-q");
  await git(root, "config", "user.email", "test@puppyone.invalid");
  await git(root, "config", "user.name", "PuppyOne Test");
  await execFileAsync("sh", ["-c", "printf publish > README.md"], { cwd: root });
  await git(root, "add", "README.md");
  await git(root, "commit", "-qm", "initial");
  if (branch !== "master") await git(root, "branch", "-M", branch);
  await git(bare, "init", "--bare", "-q");
  const head = await git(root, "rev-parse", "HEAD");
  const vault = new Map();
  const secretVault = {
    createRef: () => "11111111-1111-4111-8111-111111111111",
    put: async (ref, secret) => { vault.set(ref, secret); },
    get: async (ref) => vault.get(ref) ?? null,
    clear: async (ref) => { vault.delete(ref); },
  };
  const cloud = createCloud(root, bare);
  return {
    root,
    bare,
    head,
    vault,
    secretVault,
    cloud,
    request: {
      rootPath: root,
      apiBaseUrl: "http://127.0.0.1:8000/api/v1",
      userId: "user-1",
      organizationId: "org-1",
      projectName: "Publish fixture",
      expectedHeadCommitId: head,
      expectedBranch: branch,
    },
  };
}

function createCloud(_root, bare) {
  const requests = [];
  const cloud = {
    requests,
    projectGate: null,
    readSession: async () => ({
      user_id: "user-1",
      api_base_url: "http://127.0.0.1:8000/api/v1",
      status: "authenticated",
    }),
    requestSessionApi: async (_api, requestPath, init) => {
      const body = init.body ? JSON.parse(init.body) : null;
      requests.push({ path: requestPath, init, body });
      if (requestPath === "/projects/") {
        if (cloud.projectGate) await cloud.projectGate;
        return { id: "project-1", org_id: body.org_id, name: body.name };
      }
      if (requestPath === "/projects/project-1/git-credentials") {
        return {
          id: "credential-1",
          credential: body.credential,
          mode: "rw",
          remote: {
            url: bare,
            username: "x-puppyone-token",
            target: body.target,
          },
        };
      }
      throw new Error(`Unexpected request: ${requestPath}`);
    },
  };
  return cloud;
}

function createCoordinator(fixture, options = {}) {
  return createCloudPublishCoordinator({
    cloudAuthService: fixture.cloud,
    secretVault: fixture.secretVault,
    gitCredentialManager: {
      approve: async () => ({ rollback: async () => undefined }),
      reject: async () => undefined,
    },
    validateRemoteUrl: (value) => value,
    faultInjector: options.faultInjector,
  });
}

async function git(cwd, ...args) {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
    env: { ...process.env, LC_ALL: "C", LANG: "C" },
  });
  return stdout.trim();
}
