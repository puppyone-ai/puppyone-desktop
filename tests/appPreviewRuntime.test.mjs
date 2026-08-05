import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  BrowserWindow: { fromWebContents: () => null },
}));

const {
  createAppPreviewRuntime,
  sanitizeAppPreviewEnvironment,
} = await import("../electron/app-preview-runtime.mjs");

let workspaceRoot;
let userDataPath;
let runtime;

beforeEach(async () => {
  workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "puppyone-app-runtime-"));
  userDataPath = await mkdtemp(path.join(os.tmpdir(), "puppyone-app-runtime-user-"));
});

afterEach(async () => {
  await runtime?.closeAll();
  await rm(workspaceRoot, { recursive: true, force: true });
  await rm(userDataPath, { recursive: true, force: true });
});

function manifest(variant) {
  return JSON.stringify({
    type: "puppyone.app",
    version: 1,
    name: "Runtime test",
    launch: {
      kind: "local-server",
      command: ["node", "server.mjs"],
      cwd: ".",
      env: { TEST_VARIANT: variant },
      url: "http://127.0.0.1:${port}/",
      health: { path: "/", expectStatus: 200 },
    },
    permissions: { workspace: ["read"] },
  });
}

function createRuntime(onStateChange = vi.fn()) {
  const spawnedChildren = [];
  runtime = createAppPreviewRuntime({
    app: { getPath: () => userDataPath },
    dialog: { showMessageBox: vi.fn(async () => ({ response: 0 })) },
    shell: { openExternal: vi.fn() },
    readWorkspaceTextFile: async (rootPath, relativePath) => ({
      content: await readFile(path.join(rootPath, relativePath), "utf8"),
    }),
    resolveWorkspacePath: (rootPath, relativePath) => path.join(rootPath, relativePath),
    onStateChange,
    allocateLocalPort: vi.fn(async () => 4173),
    fetchHealth: vi.fn(async () => ({ status: 200 })),
    spawnProcess: vi.fn(() => {
      const child = new FakeChildProcess();
      spawnedChildren.push(child);
      return child;
    }),
  });
  return { service: runtime, spawnedChildren };
}

describe("App Preview process runtime", () => {
  it("reuses an unchanged workspace app and replaces it when the manifest changes", async () => {
    const appPath = "demo.puppyoneapp";
    const manifestPath = path.join(workspaceRoot, appPath);
    await writeFile(manifestPath, manifest("one"), "utf8");
    const onStateChange = vi.fn();
    const { service, spawnedChildren } = createRuntime(onStateChange);
    const sender = { id: 11 };

    const first = await service.start(sender, { rootPath: workspaceRoot, path: appPath });
    const reused = await service.start(sender, { rootPath: workspaceRoot, path: appPath });
    expect(first.status).toBe("running");
    expect(reused.runtimeId).toBe(first.runtimeId);
    expect(spawnedChildren).toHaveLength(1);

    await writeFile(manifestPath, manifest("two"), "utf8");
    const replacement = await service.start(sender, { rootPath: workspaceRoot, path: appPath });
    expect(replacement.status).toBe("running");
    expect(replacement.runtimeId).not.toBe(first.runtimeId);
    expect(spawnedChildren).toHaveLength(2);
    expect(spawnedChildren[0].signalCode).toBe("SIGTERM");
    expect(onStateChange).toHaveBeenCalledWith(expect.objectContaining({
      result: expect.objectContaining({ runtimeId: first.runtimeId, status: "stopped" }),
    }));

    const stopped = await service.stop(sender, { rootPath: workspaceRoot, path: appPath });
    expect(stopped.status).toBe("stopped");
  }, 15_000);

  it("inherits only the explicit development-tool environment allowlist", () => {
    expect(sanitizeAppPreviewEnvironment({
      PATH: "/bin",
      HOME: "/home/test",
      LC_ALL: "en_US.UTF-8",
      NVM_DIR: "/nvm",
      npm_config_prefix: "/unexpected",
      NODE_OPTIONS: "--require ./inject.cjs",
      GITHUB_TOKEN: "secret",
      OPENAI_API_KEY: "secret",
    })).toEqual({
      PATH: "/bin",
      HOME: "/home/test",
      LC_ALL: "en_US.UTF-8",
      NVM_DIR: "/nvm",
    });
  });
});

class FakeChildProcess extends EventEmitter {
  constructor() {
    super();
    this.pid = null;
    this.exitCode = null;
    this.signalCode = null;
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
  }

  kill(signal) {
    if (this.exitCode != null || this.signalCode != null) return false;
    this.signalCode = signal;
    this.emit("exit", null, signal);
    return true;
  }
}
