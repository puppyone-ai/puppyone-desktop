import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverOpenCodeExecutable, verifyBundledOpenCodeRuntime } from "../electron/main/agent/runtimes/opencode/opencode-discovery.mjs";
import { OPENCODE_RELEASE_ARTIFACTS, OPENCODE_UPSTREAM } from "../electron/main/agent/runtimes/opencode/opencode-manifest.mjs";

const roots = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => fs.promises.rm(root, { recursive: true, force: true }))));

describe("pinned OpenCode bundle integrity", () => {
  it("accepts an exact staged executable and rejects post-stage mutation", async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "puppyone-opencode-integrity-"));
    roots.push(root);
    const executablePath = path.join(root, "opencode");
    await fs.promises.writeFile(executablePath, "verified executable");
    const executableSha256 = crypto.createHash("sha256").update("verified executable").digest("hex");
    const artifact = OPENCODE_RELEASE_ARTIFACTS[`${process.platform}-${process.arch}`];
    if (!artifact) return;
    await fs.promises.writeFile(path.join(root, "verified-runtime.json"), JSON.stringify({
      schemaVersion: 1,
      version: OPENCODE_UPSTREAM.sourceVersion,
      platform: process.platform,
      arch: process.arch,
      archive: artifact.archive,
      archiveSha256: artifact.archiveSha256,
      executableSha256,
      releaseCommit: OPENCODE_UPSTREAM.releaseCommit,
    }));
    await expect(verifyBundledOpenCodeRuntime({ executablePath })).resolves.toMatchObject({ executableSha256 });
    await fs.promises.appendFile(executablePath, "tampered");
    await expect(verifyBundledOpenCodeRuntime({ executablePath })).rejects.toThrow(/SHA-256 mismatch/i);
  });

  it("skips a corrupt current slot and rolls back to the previous verified slot", async () => {
    const resourcesPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), "puppyone-opencode-rollback-"));
    roots.push(resourcesPath);
    const currentRoot = path.join(resourcesPath, "opencode", "bin");
    const previousRoot = path.join(currentRoot, "previous");
    await Promise.all([fs.promises.mkdir(currentRoot, { recursive: true }), fs.promises.mkdir(previousRoot, { recursive: true })]);
    const executableName = process.platform === "win32" ? "opencode.exe" : "opencode";
    const current = path.join(currentRoot, executableName);
    const previous = path.join(previousRoot, executableName);
    await fs.promises.writeFile(current, "corrupt current", { mode: 0o755 });
    await fs.promises.writeFile(previous, "verified previous", { mode: 0o755 });
    const artifact = OPENCODE_RELEASE_ARTIFACTS[`${process.platform}-${process.arch}`];
    if (!artifact) return;
    const metadata = (executableSha256) => JSON.stringify({
      schemaVersion: 1,
      version: OPENCODE_UPSTREAM.sourceVersion,
      platform: process.platform,
      arch: process.arch,
      archive: artifact.archive,
      archiveSha256: artifact.archiveSha256,
      executableSha256,
      releaseCommit: OPENCODE_UPSTREAM.releaseCommit,
    });
    await fs.promises.writeFile(path.join(currentRoot, "verified-runtime.json"), metadata("0".repeat(64)));
    await fs.promises.writeFile(path.join(previousRoot, "verified-runtime.json"), metadata(crypto.createHash("sha256").update("verified previous").digest("hex")));
    const spawn = (_file, args) => completedChild(args.includes("/usr/bin/env -0") ? "PATH=\0" : "opencode 1.17.18\n");
    const readiness = await discoverOpenCodeExecutable({
      resourcesPath,
      appPath: null,
      spawn,
      env: { SHELL: "/bin/zsh", PATH: "" },
      homedir: path.join(resourcesPath, "home"),
    });
    expect(readiness).toMatchObject({ status: "ready", source: "bundled", compatibility: "pinned", executablePath: await fs.promises.realpath(previous) });
  });

  it("does not assume an older external CLI implements the pinned HTTP/SSE contract", async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "puppyone-opencode-old-external-"));
    roots.push(root);
    const executable = path.join(root, process.platform === "win32" ? "opencode.exe" : "opencode");
    await fs.promises.writeFile(executable, "old external", { mode: 0o755 });
    const spawn = (_file, args) => completedChild(args.includes("/usr/bin/env -0")
      ? `PATH=${root}\0`
      : "opencode 1.1.33\n");

    const readiness = await discoverOpenCodeExecutable({
      resourcesPath: path.join(root, "missing-resources"),
      appPath: null,
      spawn,
      env: { SHELL: "/bin/zsh", PATH: root },
      homedir: root,
    });

    expect(readiness).toMatchObject({
      status: "unsupported-version",
      version: "1.1.33",
      minimumVersion: "1.17.18",
      source: "external",
      compatibility: "unavailable",
    });
  });
});

function completedChild(stdoutValue) {
  const child = {
    stdout: { on(event, listener) { if (event === "data") queueMicrotask(() => listener(stdoutValue)); } },
    stderr: { on() {} },
    kill() {},
    once(event, listener) { if (event === "close") queueMicrotask(() => listener(0, null)); },
  };
  return child;
}
