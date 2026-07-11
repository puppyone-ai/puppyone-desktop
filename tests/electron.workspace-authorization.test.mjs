import * as fs from "node:fs";
import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerAppPreviewIpcHandlers } from "../electron/main/ipc/app-preview-ipc.mjs";
import { registerTerminalIpcHandlers } from "../electron/main/ipc/terminal-ipc.mjs";
import { registerWorkspaceGitIpcHandlers } from "../electron/main/ipc/workspace-git-ipc.mjs";
import { registerWorkspaceNavigationIpcHandlers } from "../electron/main/ipc/workspace-navigation-ipc.mjs";
import { registerWorkspaceWatchIpcHandlers } from "../electron/main/ipc/workspace-watch-ipc.mjs";
import { registerGitMetadataWatchIpcHandlers } from "../electron/main/ipc/git-metadata-watch-ipc.mjs";
import { createTerminalService } from "../electron/main/terminal-service.mjs";
import {
  createSenderWorkspaceAuthorization,
  resolveCanonicalWorkspaceDirectory,
} from "../electron/main/workspace-authorization.mjs";
import { createWorkspaceStateStore } from "../electron/main/workspace-state-store.mjs";

let root;
let otherRoot;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "puppyone-auth-root-"));
  otherRoot = await mkdtemp(path.join(os.tmpdir(), "puppyone-auth-other-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(otherRoot, { recursive: true, force: true });
});

describe("sender-bound workspace authorization", () => {
  it.skipIf(process.platform === "win32")("canonicalizes the assigned root, accepts only an alias of that root, and rejects no-workspace senders", async () => {
    const aliasParent = await mkdtemp(path.join(os.tmpdir(), "puppyone-auth-alias-"));
    const aliasPath = path.join(aliasParent, "workspace");
    await symlink(root, aliasPath, "dir");
    try {
      const authorize = createSenderWorkspaceAuthorization({
        fsModule: fs,
        getWorkspaceRootForSender: () => root,
      });
      await expect(authorize({ sender: { id: 1 } }, aliasPath)).resolves.toBe(await fs.promises.realpath(root));
      await expect(authorize({ sender: { id: 1 } }, otherRoot)).rejects.toThrow(/does not match/i);

      const authorizeWithoutWorkspace = createSenderWorkspaceAuthorization({
        fsModule: fs,
        getWorkspaceRootForSender: () => null,
      });
      await expect(authorizeWithoutWorkspace({ sender: { id: 2 } }, root)).rejects.toThrow(/no local workspace/i);
    } finally {
      await rm(aliasParent, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === "win32")("realpaths working directories and rejects a symlink escaping the workspace", async () => {
    const inside = path.join(root, "app");
    const escape = path.join(root, "escape");
    await mkdir(inside);
    await symlink(otherRoot, escape, "dir");

    await expect(resolveCanonicalWorkspaceDirectory(root, inside, {
      fsModule: fs,
      label: "App preview cwd",
    })).resolves.toBe(await fs.promises.realpath(inside));
    await expect(resolveCanonicalWorkspaceDirectory(root, escape, {
      fsModule: fs,
      label: "App preview cwd",
    })).rejects.toThrow(/inside the assigned workspace/i);
  });

  it("blocks an arbitrary root across Git, watch, AI review, App Preview, and terminal create", async () => {
    const { ipcMain, handlers } = createIpcHarness();
    const authorizeWorkspaceRoot = createSenderWorkspaceAuthorization({
      fsModule: fs,
      getWorkspaceRootForSender: () => root,
    });
    const appPreviewRuntime = {
      start: vi.fn(),
      restart: vi.fn(),
      stop: vi.fn(),
      getLogs: vi.fn(),
      openExternal: vi.fn(),
    };
    const workspaceWatchService = { start: vi.fn(), stop: vi.fn() };
    const gitMetadataWatchService = { start: vi.fn(), stop: vi.fn(), stopForWindow: vi.fn(), closeAll: vi.fn() };
    const terminalService = {
      create: vi.fn(),
      input: vi.fn(),
      resize: vi.fn(),
      close: vi.fn(),
    };

    registerWorkspaceGitIpcHandlers({
      ipcMain,
      BrowserWindow: { fromWebContents: () => null },
      dialog: { showMessageBox: vi.fn() },
      authorizeWorkspaceRoot,
    });
    registerWorkspaceWatchIpcHandlers({ ipcMain, workspaceWatchService, authorizeWorkspaceRoot });
    registerGitMetadataWatchIpcHandlers({ ipcMain, gitMetadataWatchService, authorizeWorkspaceRoot });
    registerAppPreviewIpcHandlers({ ipcMain, appPreviewRuntime, authorizeWorkspaceRoot });
    registerTerminalIpcHandlers({ ipcMain, terminalService, authorizeWorkspaceRoot });

    const event = { sender: { id: 7 } };
    for (const [channel, request] of [
      ["workspace:git-status", { rootPath: otherRoot }],
      ["workspace:watch-start", { rootPath: otherRoot }],
      ["git-repository:watch-start", { rootPath: otherRoot }],
      ["ai-edit-review:get-latest", { rootPath: otherRoot }],
      ["app-preview:start", { rootPath: otherRoot, path: "app.puppyoneapp" }],
      ["terminal:create", { rootPath: otherRoot, cwd: otherRoot }],
    ]) {
      await expect(handlers.get(channel)(event, request)).rejects.toThrow(/does not match/i);
    }

    expect(workspaceWatchService.start).not.toHaveBeenCalled();
    expect(appPreviewRuntime.start).not.toHaveBeenCalled();
    expect(terminalService.create).not.toHaveBeenCalled();
  });

  it("passes the canonical root to App Preview and the sender to terminal mutations", async () => {
    const { ipcMain, handlers, listeners } = createIpcHarness();
    const authorizeWorkspaceRoot = createSenderWorkspaceAuthorization({
      fsModule: fs,
      getWorkspaceRootForSender: () => root,
    });
    const appPreviewRuntime = {
      start: vi.fn(async () => ({ status: "running" })),
      restart: vi.fn(),
      stop: vi.fn(),
      getLogs: vi.fn(),
      openExternal: vi.fn(),
    };
    const terminalService = {
      create: vi.fn(),
      input: vi.fn(),
      resize: vi.fn(),
      close: vi.fn(),
    };
    registerAppPreviewIpcHandlers({ ipcMain, appPreviewRuntime, authorizeWorkspaceRoot });
    registerTerminalIpcHandlers({ ipcMain, terminalService, authorizeWorkspaceRoot });

    const sender = { id: 8 };
    const event = { sender };
    await handlers.get("app-preview:start")(event, { rootPath: root, path: "app.puppyoneapp" });
    expect(appPreviewRuntime.start).toHaveBeenCalledWith(sender, {
      rootPath: await fs.promises.realpath(root),
      path: "app.puppyoneapp",
    });

    listeners.get("terminal:input")(event, { id: "terminal-1", data: "pwd\n" });
    listeners.get("terminal:resize")(event, { id: "terminal-1", cols: 100, rows: 40 });
    await handlers.get("terminal:close")(event, "terminal-1");
    expect(terminalService.input).toHaveBeenCalledWith(sender, { id: "terminal-1", data: "pwd\n" });
    expect(terminalService.resize).toHaveBeenCalledWith(sender, { id: "terminal-1", cols: 100, rows: 40 });
    expect(terminalService.close).toHaveBeenCalledWith(sender, "terminal-1");
  });
});

describe("recent workspace authorization", () => {
  it("allows open-current/open-new only for main-persisted recent paths", async () => {
    const stateStore = createWorkspaceStateStore({
      app: { getPath: () => root },
      filename: "workspace-state-test.json",
      canonicalizeWorkspacePath: (value) => fs.promises.realpath(path.resolve(value)),
      workspaceFromPath: async (value) => ({ path: value, name: path.basename(value) }),
      logger: { warn: vi.fn() },
    });
    await stateStore.rememberRecentWorkspacePath(root);

    const { ipcMain, handlers } = createIpcHarness();
    const openWorkspaceInCurrentWindow = vi.fn(async () => ({ status: "opened-current" }));
    const openWorkspaceInNewWindow = vi.fn(async () => ({ status: "opened-new" }));
    registerWorkspaceNavigationIpcHandlers({
      ipcMain,
      workspaceStateStore: stateStore,
      getInitialWorkspaceResultForWindow: vi.fn(),
      forgetCurrentWindowWorkspace: vi.fn(),
      showHomepageForCurrentWindow: vi.fn(),
      openWorkspaceInCurrentWindow,
      openWorkspaceInNewWindow,
      createCloudWorkspaceFromRequest: vi.fn(),
      openVirtualWorkspaceInNewWindow: vi.fn(),
      selectWorkspaceForCurrentWindow: vi.fn(),
      selectWorkspaceForNewWindow: vi.fn(),
    });

    const event = { sender: { id: 9 } };
    await expect(handlers.get("workspace:open-current")(event, otherRoot)).rejects.toThrow(/recent workspace list/i);
    await expect(handlers.get("workspace:open-new-window")(event, otherRoot)).rejects.toThrow(/recent workspace list/i);
    expect(openWorkspaceInCurrentWindow).not.toHaveBeenCalled();
    expect(openWorkspaceInNewWindow).not.toHaveBeenCalled();

    await expect(handlers.get("workspace:open-current")(event, root)).resolves.toEqual({ status: "opened-current" });
    expect(openWorkspaceInCurrentWindow).toHaveBeenCalledWith(event.sender, await fs.promises.realpath(root));
    expect(handlers.has("workspace:remember-last")).toBe(false);
    expect(handlers.has("workspace:from-path")).toBe(false);
  });
});

describe("terminal session ownership", () => {
  it("requires a workspace and prevents another sender from input, resize, close, or id replacement", async () => {
    const terminals = [];
    const ptyService = {
      spawn: vi.fn(() => {
        const terminal = createFakeTerminal();
        terminals.push(terminal);
        return terminal;
      }),
    };
    const service = createTerminalService({
      appVersion: "test",
      initializeWorkspaceEditReview: vi.fn(async () => undefined),
      ptyService,
      logger: { warn: vi.fn() },
    });
    const owner = createSender(21);
    const attacker = createSender(22);
    const request = { id: "terminal_owner_1", cwd: root, cols: 80, rows: 24 };

    await expect(service.create(owner, request, null)).rejects.toThrow(/no local workspace/i);
    await expect(service.create(owner, request, root)).resolves.toMatchObject({ id: "terminal_owner_1" });
    expect(ptyService.spawn).toHaveBeenCalledOnce();

    expect(service.input(attacker, { id: request.id, data: "rm -rf ~\n" })).toBe(false);
    expect(service.resize(attacker, { id: request.id, cols: 120, rows: 60 })).toBe(false);
    expect(service.close(attacker, request.id)).toBe(false);
    expect(terminals[0].write).not.toHaveBeenCalled();
    expect(terminals[0].resize).not.toHaveBeenCalled();
    expect(terminals[0].kill).not.toHaveBeenCalled();
    await expect(service.create(attacker, request, root)).rejects.toThrow(/owned by another window/i);

    expect(service.input(owner, { id: request.id, data: "pwd\n" })).toBe(true);
    expect(service.resize(owner, { id: request.id, cols: 100, rows: 40 })).toBe(true);
    expect(service.close(owner, request.id)).toBe(true);
    expect(terminals[0].write).toHaveBeenCalledWith("pwd\n");
    expect(terminals[0].resize).toHaveBeenCalledWith(100, 40);
    expect(terminals[0].kill).toHaveBeenCalledOnce();
  });
});

function createIpcHarness() {
  const handlers = new Map();
  const listeners = new Map();
  return {
    handlers,
    listeners,
    ipcMain: {
      handle: (channel, listener) => handlers.set(channel, listener),
      on: (channel, listener) => listeners.set(channel, listener),
    },
  };
}

function createFakeTerminal() {
  return {
    pid: 123,
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn(),
    onExit: vi.fn(),
  };
}

function createSender(id) {
  return {
    id,
    isDestroyed: () => false,
    send: vi.fn(),
  };
}
