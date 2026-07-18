import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCloudPublishCoordinator } from "../electron/main/cloud-publish-coordinator.mjs";
import { execGit } from "../local-api/git/runner.mjs";

const execFileAsync = promisify(execFile);
const roots = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Cloud publish coordinator", () => {
  it("creates once, keeps the credential out of the journal, and maps a feature branch to Cloud main", async () => {
    const fixture = await createFixture("feature/design");
    const coordinator = createCoordinator(fixture);
    const progress = [];

    const result = await coordinator.startOrResume(fixture.request, {
      onProgress: (event) => progress.push(event),
    });

    expect(result.ok).toBe(true);
    expect(result.state).toMatchObject({ phase: "completed", destinationBranch: "main" });
    expect(fixture.cloud.requests.filter((entry) => entry.path === "/projects/")).toHaveLength(1);
    expect(fixture.cloud.requests.find((entry) => entry.path === "/projects/")?.body).toEqual({
      org_id: "org-1",
      name: "Publish fixture",
      description: null,
    });
    const credentialRequest = fixture.cloud.requests.find((entry) => entry.path.endsWith("/git-credentials"));
    expect(credentialRequest?.init.headers).toMatchObject({
      "Idempotency-Key": expect.stringMatching(/^[0-9a-f-]{36}$/),
      "X-PuppyOne-Repository-Contract": "2",
    });
    expect(credentialRequest?.body.credential).toMatch(/^pwg_/);
    expect(await git(fixture.root, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"))
      .toBe("puppyone/main");
    expect(await git(fixture.bare, "rev-parse", "refs/heads/main")).toBe(fixture.head);
    const gitDir = await git(fixture.root, "rev-parse", "--absolute-git-dir");
    await expect(readFile(path.join(gitDir, "puppyone", "pending-cloud-publish.v1.json"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
    expect([...fixture.vault.values()].join("\n")).not.toContain("pwg_");
    expect([...new Set(progress.map(({ stage }) => stage))]).toEqual([
      "validating",
      "creating-project",
      "securing-credential",
      "configuring-remote",
      "checking-remote",
      "uploading",
      "confirming",
      "finalizing",
      "completed",
    ]);
    expect(progress.at(-1)).toMatchObject({
      rootPath: fixture.root,
      stage: "completed",
      state: { phase: "completed" },
    });
    expect(JSON.stringify(progress)).not.toContain("pwg_");
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
    expect(await git(fixture.root, "remote", "get-url", "puppyone")).toBe(fixture.remoteUrl);

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

  it("serializes two independent coordinator instances with the common repository lease", async () => {
    const fixture = await createFixture("main");
    let release;
    fixture.cloud.projectGate = new Promise((resolve) => { release = resolve; });
    const first = createCoordinator(fixture).startOrResume(fixture.request);
    await vi.waitFor(() => {
      expect(fixture.cloud.requests.filter((entry) => entry.path === "/projects/")).toHaveLength(1);
    });

    const raced = await createCoordinator(fixture).startOrResume(fixture.request);
    expect(raced).toMatchObject({
      ok: false,
      error: { code: "JOURNAL_IO_FAILED", retryable: true },
    });
    expect(fixture.cloud.requests.filter((entry) => entry.path === "/projects/")).toHaveLength(1);

    release();
    await expect(first).resolves.toMatchObject({ ok: true });
  });

  it("never persists the main-owned raw credential in a crash journal", async () => {
    const fixture = await createFixture("main");
    const crash = Object.assign(new Error("crash after credential"), { simulateCrash: true });
    await expect(createCoordinator(fixture, {
      faultInjector: async (point) => {
        if (point === "after-credential-issued") throw crash;
      },
    }).startOrResume(fixture.request)).rejects.toBe(crash);

    const gitDir = await git(fixture.root, "rev-parse", "--absolute-git-dir");
    const journal = await readFile(path.join(gitDir, "puppyone", "pending-cloud-publish.v1.json"), "utf8");
    const secret = [...fixture.vault.values()][0];
    expect(secret).toMatch(/^pwg_/);
    expect(journal).not.toContain(secret);
    expect(journal).not.toContain("pwg_");
  });

  it("rejects a tampered journal remote before reading a secret or running network Git", async () => {
    const fixture = await createFixture("main");
    const crash = Object.assign(new Error("pause with credential state"), { simulateCrash: true });
    await expect(createCoordinator(fixture, {
      faultInjector: async (point) => {
        if (point === "after-credential-config-journaled") throw crash;
      },
    }).startOrResume(fixture.request)).rejects.toBe(crash);

    const gitDir = await git(fixture.root, "rev-parse", "--absolute-git-dir");
    const journalPath = path.join(gitDir, "puppyone", "pending-cloud-publish.v1.json");
    const record = JSON.parse(await readFile(journalPath, "utf8"));
    record.canonical_remote_url = "https://attacker.invalid/git/project-1.git";
    record.credential_config_snapshot.scope_url = record.canonical_remote_url;
    await writeFile(journalPath, `${JSON.stringify(record)}\n`, { mode: 0o600 });

    const secretGet = vi.fn(fixture.secretVault.get);
    const networkGit = [];
    const result = await createCoordinator(fixture, {
      secretVault: { ...fixture.secretVault, get: secretGet },
      validateRemoteUrl: (value) => {
        if (value !== fixture.remoteUrl) throw new Error("untrusted remote");
        return value;
      },
      onExecGitCommand: (args) => {
        if (args.includes("ls-remote") || args.includes("push")) networkGit.push(args);
      },
    }).startOrResume(fixture.request);

    expect(result).toMatchObject({ ok: false, error: { code: "REMOTE_CONFLICT" } });
    expect(secretGet).not.toHaveBeenCalled();
    expect(networkGit).toEqual([]);
  });

  it("replays Project creation with the same UUID after its response is lost", async () => {
    const fixture = await createFixture("main");
    const crash = Object.assign(new Error("lost Project response"), { simulateCrash: true });
    await expect(createCoordinator(fixture, {
      faultInjector: async (point) => {
        if (point === "after-project-response") throw crash;
      },
    }).startOrResume(fixture.request)).rejects.toBe(crash);

    const resumed = await createCoordinator(fixture).startOrResume(fixture.request);
    expect(resumed.ok).toBe(true);
    const creates = fixture.cloud.requests.filter((entry) => entry.path === "/projects/");
    expect(creates).toHaveLength(2);
    expect(new Set(creates.map((entry) => entry.init.headers["Idempotency-Key"])).size).toBe(1);
    expect(creates[0].body).toEqual(creates[1].body);
  });

  it("accepts a server-allocated display name without losing the durable Project identity", async () => {
    const fixture = await createFixture("main");
    fixture.cloud.projectName = "Untitled Project 2";

    const result = await createCoordinator(fixture).startOrResume({
      ...fixture.request,
      projectName: "Untitled Project",
    });

    expect(result).toMatchObject({ ok: true, state: { phase: "completed" } });
    expect(fixture.cloud.requests.find((entry) => entry.path === "/projects/")?.body.name)
      .toBe("Untitled Project");
    expect(fixture.cloud.requests.filter((entry) => entry.path.endsWith("/git-credentials")))
      .toHaveLength(1);
  });

  it("rejects a Project response that omits the explicitly requested Organization", async () => {
    const fixture = await createFixture("main");
    fixture.cloud.omitProjectOrganization = true;

    const result = await createCoordinator(fixture).startOrResume(fixture.request);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "PROJECT_CREATE_FAILED", retryable: false },
    });
    expect(fixture.cloud.requests.filter((entry) => entry.path.endsWith("/git-credentials")))
      .toHaveLength(0);
  });

  it("reconciles a crash after the push side effect without creating another Project", async () => {
    const fixture = await createFixture("main");
    const crash = Object.assign(new Error("crash after push"), { simulateCrash: true });
    await expect(createCoordinator(fixture, {
      faultInjector: async (point) => {
        if (point === "after-push-side-effect") throw crash;
      },
    }).startOrResume(fixture.request)).rejects.toBe(crash);
    expect(await git(fixture.bare, "rev-parse", "refs/heads/main")).toBe(fixture.head);

    const resumed = await createCoordinator(fixture).startOrResume(fixture.request);
    expect(resumed).toMatchObject({ ok: true, state: { phase: "completed" } });
    expect(fixture.cloud.requests.filter((entry) => entry.path === "/projects/")).toHaveLength(1);
  });

  it("does not delete local state when Abandon races with an accepted initial push", async () => {
    const fixture = await createFixture("main");
    const crash = Object.assign(new Error("pause before push"), { simulateCrash: true });
    const coordinator = createCoordinator(fixture, {
      faultInjector: async (point) => {
        if (point === "after-remote-configured") throw crash;
      },
    });
    await expect(coordinator.startOrResume(fixture.request)).rejects.toBe(crash);
    await git(fixture.root, "push", fixture.bare, `${fixture.head}:refs/heads/main`);

    const pending = await createCoordinator(fixture).getState(fixture.request);
    expect(pending).toMatchObject({ ok: true, state: { phase: "remote-configured" } });
    const originalRequest = fixture.cloud.requestSessionApi;
    fixture.cloud.requestSessionApi = async (apiBase, requestPath, init) => {
      if (requestPath.endsWith("/initialization/abandon")) {
        fixture.cloud.requests.push({ path: requestPath, init, body: JSON.parse(init.body) });
        throw Object.assign(new Error("Project already has an accepted push"), {
          status: 409,
          code: "initialization_not_abandonable",
        });
      }
      return originalRequest(apiBase, requestPath, init);
    };

    const abandoned = await createCoordinator(fixture).abandon({
      ...fixture.request,
      operationId: pending.state.operationId,
    });
    expect(abandoned).toMatchObject({ ok: false, state: { phase: "pushed" } });
    expect(await git(fixture.root, "remote", "get-url", "puppyone")).toBe(fixture.remoteUrl);

    const resumed = await createCoordinator(fixture).startOrResume(fixture.request);
    expect(resumed).toMatchObject({ ok: true, state: { phase: "completed" } });
  });

  it("uses the journaled canonical URL when another Git process mutates the remote name", async () => {
    const fixture = await createFixture("main");
    const attacker = await mkdtemp(path.join(os.tmpdir(), "puppyone-publish-attacker-"));
    roots.push(attacker);
    await git(attacker, "init", "--bare", "-q");
    let mutated = false;
    const result = await createCoordinator(fixture, {
      faultInjector: async (point) => {
        if (point === "after-push-remote-verified" && !mutated) {
          mutated = true;
          await git(fixture.root, "remote", "set-url", "puppyone", pathToFileURL(attacker).toString());
        }
      },
    }).startOrResume(fixture.request);

    expect(result).toMatchObject({ ok: false, error: { code: "REMOTE_CONFLICT" } });
    expect(await git(fixture.bare, "rev-parse", "refs/heads/main")).toBe(fixture.head);
    await expect(git(attacker, "rev-parse", "refs/heads/main")).rejects.toBeTruthy();
  });

  it("pins the allowlisted helper in command scope across a local config mutation race", async () => {
    const fixture = await createFixture("main");
    let pushArgs = null;
    const result = await createCoordinator(fixture, {
      faultInjector: async (point) => {
        if (point === "after-push-remote-verified") {
          await git(
            fixture.root,
            "config",
            "--local",
            "--replace-all",
            `credential.${fixture.remoteUrl}.helper`,
            "!malicious-capture",
          );
        }
      },
      onExecGitCommand: (args) => {
        if (args.includes("push")) pushArgs = [...args];
      },
    }).startOrResume(fixture.request);

    expect(result.ok).toBe(true);
    expect(pushArgs).toContain(`credential.${fixture.remoteUrl}.helper=`);
    expect(pushArgs).toContain(`credential.${fixture.remoteUrl}.helper=osxkeychain`);
    expect(pushArgs.join(" ")).not.toContain("malicious-capture");
    expect(await git(fixture.bare, "rev-parse", "refs/heads/main")).toBe(fixture.head);
  });

  it("durably owns a remote added just before a crash and removes it on later Abandon", async () => {
    const fixture = await createFixture("main");
    const firstCrash = Object.assign(new Error("crash after remote add"), { simulateCrash: true });
    await expect(createCoordinator(fixture, {
      faultInjector: async (point) => {
        if (point === "after-remote-add") throw firstCrash;
      },
    }).startOrResume(fixture.request)).rejects.toBe(firstCrash);
    expect(await git(fixture.root, "remote", "get-url", "puppyone")).toBe(fixture.remoteUrl);

    const secondCrash = Object.assign(new Error("pause after ownership recovery"), { simulateCrash: true });
    await expect(createCoordinator(fixture, {
      faultInjector: async (point) => {
        if (point === "after-remote-configured") throw secondCrash;
      },
    }).startOrResume(fixture.request)).rejects.toBe(secondCrash);
    const pending = await createCoordinator(fixture).getState(fixture.request);
    expect(pending).toMatchObject({ ok: true, state: { phase: "remote-configured" } });

    const abandoned = await createCoordinator(fixture).abandon({
      ...fixture.request,
      operationId: pending.state.operationId,
    });
    expect(abandoned.ok).toBe(true);
    await expect(git(fixture.root, "remote", "get-url", "puppyone")).rejects.toBeTruthy();
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
  const remoteUrl = "https://api.puppyone.test/git/project-1.git";
  cloud.remoteUrl = remoteUrl;
  return {
    root,
    bare,
    head,
    vault,
    secretVault,
    cloud,
    remoteUrl,
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

function createCloud(_root, _bare) {
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
        return {
          id: "project-1",
          ...(cloud.omitProjectOrganization ? {} : { org_id: body.org_id }),
          name: cloud.projectName ?? body.name,
        };
      }
      if (requestPath === "/projects/project-1/git-credentials") {
        return {
          id: "credential-1",
          mode: "rw",
          remote: {
            url: cloud.remoteUrl,
            username: "x-puppyone-token",
            target: body.target,
          },
        };
      }
      if (requestPath === "/projects/project-1/initialization/abandon") {
        return { abandoned: true };
      }
      throw new Error(`Unexpected request: ${requestPath}`);
    },
  };
  return cloud;
}

function createCoordinator(fixture, options = {}) {
  const credentialConfigSnapshot = {
    version: 1,
    scope_url: fixture.remoteUrl,
    helper: "osxkeychain",
    previous_helpers: [],
    previous_use_http_path: [],
  };
  return createCloudPublishCoordinator({
    cloudAuthService: fixture.cloud,
    secretVault: options.secretVault ?? fixture.secretVault,
    gitCredentialManager: {
      prepare: async () => credentialConfigSnapshot,
      approve: async () => ({ rollback: async () => undefined }),
      assertManaged: async () => undefined,
      cleanupManaged: async () => undefined,
      commandArgs: (remoteUrl, snapshot, args) => [
        "-c", `credential.${remoteUrl}.helper=`,
        "-c", `credential.${remoteUrl}.helper=${snapshot.helper}`,
        "-c", `credential.${remoteUrl}.useHttpPath=true`,
        ...args,
      ],
    },
    execGitCommand: async (rootPath, args, commandOptions) => {
      options.onExecGitCommand?.(args);
      const mapped = args.some((arg) => ["ls-remote", "push"].includes(arg))
        ? args.map((arg) => arg === fixture.remoteUrl ? fixture.bare : arg)
        : args;
      return execGit(rootPath, mapped, commandOptions);
    },
    validateRemoteUrl: options.validateRemoteUrl ?? ((value) => value),
    faultInjector: options.faultInjector,
  });
}

async function git(cwd, ...args) {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
    env: { ...process.env, LC_ALL: "C", LANG: "C" },
  });
  return stdout.trim();
}
