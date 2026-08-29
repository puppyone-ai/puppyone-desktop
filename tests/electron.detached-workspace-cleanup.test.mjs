import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createDetachedWorkspaceCleanup } from "../electron/main/detached-workspace-cleanup.mjs";

describe("detached Workspace root cleanup", () => {
  it("releases only the detached root and rebinds primary-root services", async () => {
    const harness = createHarness();

    await harness.cleanup(harness.window, { path: "/workspace-a" });

    expect(harness.localFileCapabilities.revokeWorkspaceRoot).toHaveBeenCalledWith(42, "/workspace-a");
    expect(harness.workspaceWatchService.stopForWorkspaceRoot).toHaveBeenCalledWith(42, "/workspace-a");
    expect(harness.gitMetadataWatchService.stopForWorkspaceRoot).toHaveBeenCalledWith(42, "/workspace-a");
    expect(harness.terminalService.closeSessionsForWorkspaceRoot).toHaveBeenCalledWith(42, "/workspace-a");
    expect(harness.appPreviewRuntime.closeSessionsForWorkspaceRoot).toHaveBeenCalledWith(42, "/workspace-a");
    expect(harness.agentService.closeSessionsForWorkspaceRoot).toHaveBeenCalledWith(42, "/workspace-a");
    expect(harness.gitAutoCommitHost.assignWorkspace).toHaveBeenCalledWith(
      harness.window.webContents,
      "/workspace-b",
    );
    expect(harness.window.setRepresentedFilename).toHaveBeenCalledWith("/workspace-b");
    expect(harness.window.setTitle).toHaveBeenCalledWith("Workspace B");
  });

  it("keeps post-detach failures outside the committed detach transaction", async () => {
    const harness = createHarness({
      assignWorkspace: vi.fn(async () => {
        throw new Error("assignment failed");
      }),
    });
    harness.localFileCapabilities.revokeWorkspaceRoot.mockImplementation(() => {
      throw new Error("revocation failed");
    });

    await expect(harness.cleanup(harness.window, { path: "/workspace-a" })).resolves.toBeUndefined();
    expect(harness.agentService.closeSessionsForWorkspaceRoot).toHaveBeenCalled();
    expect(harness.logger.warn).toHaveBeenCalledWith(
      "Unable to reassign Git Auto Commit after removing a Project:",
      expect.any(Error),
    );
  });

  it("wires cleanup through the explicit Git Auto Commit host boundary", () => {
    const mainSource = readFileSync(new URL("../electron/main.mjs", import.meta.url), "utf8");

    expect(mainSource).toContain("createDetachedWorkspaceCleanup");
    expect(mainSource).not.toContain("gitAutoCommitService.assignWorkspace");
  });
});

function createHarness({ assignWorkspace = vi.fn(async () => undefined) } = {}) {
  const localFileCapabilities = { revokeWorkspaceRoot: vi.fn() };
  const workspaceWatchService = { stopForWorkspaceRoot: vi.fn() };
  const gitMetadataWatchService = { stopForWorkspaceRoot: vi.fn() };
  const terminalService = { closeSessionsForWorkspaceRoot: vi.fn() };
  const appPreviewRuntime = { closeSessionsForWorkspaceRoot: vi.fn(async () => undefined) };
  const agentService = { closeSessionsForWorkspaceRoot: vi.fn(async () => undefined) };
  const gitAutoCommitHost = { assignWorkspace };
  const logger = { warn: vi.fn() };
  const window = {
    webContents: { id: 42 },
    isFullScreen: vi.fn(() => false),
    setRepresentedFilename: vi.fn(),
    setTitle: vi.fn(),
  };
  const cleanup = createDetachedWorkspaceCleanup({
    agentService,
    getAppPreviewRuntime: () => appPreviewRuntime,
    getWindowState: () => ({ folderPaths: ["/workspace-b"] }),
    gitAutoCommitHost,
    gitMetadataWatchService,
    localFileCapabilities,
    logger,
    resolveWindowTitle: () => "Workspace B",
    terminalService,
    workspaceWatchService,
  });
  return {
    cleanup,
    window,
    localFileCapabilities,
    workspaceWatchService,
    gitMetadataWatchService,
    terminalService,
    appPreviewRuntime,
    agentService,
    gitAutoCommitHost,
    logger,
  };
}
