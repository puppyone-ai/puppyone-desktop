import { describe, expect, it, vi } from "vitest";
import {
  CLOUD_INITIAL_PUSH_TIMEOUT_MS,
  createCloudPublishGitService,
} from "../electron/main/cloud-publish-git.mjs";

const REMOTE = "https://api.puppyone.test/git/project-1.git";
const HEAD = "0123456789abcdef0123456789abcdef01234567";

describe("Cloud publish Git diagnostics", () => {
  it("reports the failing remote stage while redacting credential material", async () => {
    let remoteExists = false;
    const rollback = vi.fn(async () => undefined);
    const service = createCloudPublishGitService({
      execGitCommand: async (_rootPath, args) => {
        if (args[0] === "symbolic-ref") return { stdout: "main\n", stderr: "" };
        if (args[0] === "rev-parse") return { stdout: `${HEAD}\n`, stderr: "" };
        if (args.join(" ") === "remote") {
          return { stdout: remoteExists ? "puppyone\n" : "", stderr: "" };
        }
        if (args[0] === "remote" && args[1] === "add") {
          remoteExists = true;
          return { stdout: "", stderr: "" };
        }
        if (args[0] === "remote" && args[1] === "get-url") {
          return { stdout: `${REMOTE}\n`, stderr: "" };
        }
        if (args.includes("ls-remote")) {
          const error = new Error("Git remote verification failed");
          error.stderr = "fatal: Authentication failed for 'https://x-puppyone-token:pwg_do_not_leak@api.puppyone.test/git/project-1.git'";
          throw error;
        }
        throw new Error(`Unexpected Git command: ${args.join(" ")}`);
      },
      gitCredentialManager: {
        prepare: async () => ({}),
        approve: async () => ({ rollback }),
        assertManaged: async () => undefined,
        cleanupManaged: async () => undefined,
        commandArgs: (_url, _snapshot, args) => args,
      },
    });

    await expect(service.configureCanonicalRemote("/workspace", record(), "pwg_do_not_leak"))
      .rejects.toMatchObject({
        publishCode: "REMOTE_CONFIG_FAILED",
        message: expect.stringMatching(/verifying Cloud Git access.*Authentication failed/i),
      });
    await expect(service.configureCanonicalRemote("/workspace", record(), "pwg_do_not_leak"))
      .rejects.not.toThrow(/pwg_do_not_leak|x-puppyone-token:/i);
    expect(rollback).toHaveBeenCalled();
  });

  it("uses the long initial-push budget and reconciles an uncertain timeout", async () => {
    let remoteReadCount = 0;
    const waits = [];
    const rollback = vi.fn(async () => undefined);
    const execGitCommand = vi.fn(async (_rootPath, args, options = {}) => {
      const command = args[0];
      if (command === "symbolic-ref") return { stdout: "main\n", stderr: "" };
      if (command === "rev-parse") return { stdout: `${HEAD}\n`, stderr: "" };
      if (args.join(" ") === "remote") return { stdout: "puppyone\n", stderr: "" };
      if (command === "remote" && args.includes("get-url")) {
        return { stdout: `${REMOTE}\n`, stderr: "" };
      }
      if (command === "ls-remote") {
        remoteReadCount += 1;
        return {
          stdout: remoteReadCount >= 3 ? `${HEAD}\trefs/heads/main\n` : "",
          stderr: "",
        };
      }
      if (command === "push") {
        expect(options.timeout).toBe(CLOUD_INITIAL_PUSH_TIMEOUT_MS);
        const error = new Error("Git command timed out");
        error.code = "ETIMEDOUT";
        error.killed = true;
        throw error;
      }
      if (command === "update-ref" || command === "branch") {
        return { stdout: "", stderr: "" };
      }
      throw new Error(`Unexpected Git command: ${args.join(" ")}`);
    });
    const status = { branch: "main", headCommitId: HEAD };
    const service = createCloudPublishGitService({
      execGitCommand,
      getGitStatus: async () => status,
      wait: async (delayMs) => waits.push(delayMs),
      gitCredentialManager: {
        prepare: async () => ({}),
        approve: async () => ({ rollback }),
        assertManaged: async () => undefined,
        cleanupManaged: async () => undefined,
        commandArgs: (_url, _snapshot, args) => args,
      },
    });

    await expect(service.pushExpectedCommit("/workspace", record(), "pwg_secret"))
      .resolves.toBe(status);
    expect(execGitCommand.mock.calls.filter(([, args]) => args[0] === "push")).toHaveLength(1);
    expect(waits).toEqual([2_000]);
    expect(rollback).not.toHaveBeenCalled();
  });
});

function record() {
  return {
    operation_id: "11111111-1111-4111-8111-111111111111",
    project_id: "project-1",
    credential_id: "credential-1",
    canonical_remote_url: REMOTE,
    credential_username: "x-puppyone-token",
    credential_config_snapshot: { helper: "osxkeychain" },
    expected_branch: "main",
    expected_head_commit_id: HEAD,
    remote_add_intent: true,
  };
}
