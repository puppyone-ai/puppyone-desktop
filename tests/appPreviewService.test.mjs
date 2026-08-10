import { describe, expect, it, vi } from "vitest";
import { createAppPreviewService } from "../electron/main/app-preview-service.mjs";

describe("App Preview service", () => {
  it("coordinates a running workspace runtime with a reusable browser surface", async () => {
    const runtimeResult = {
      runtimeId: "runtime-1",
      appId: "app-1",
      name: "Demo",
      status: "running",
      path: "demo.puppyoneapp",
      url: "http://127.0.0.1:4173/",
    };
    const runtime = {
      start: vi.fn(async () => runtimeResult),
      restart: vi.fn(async () => ({ ...runtimeResult, runtimeId: "runtime-2" })),
      stop: vi.fn(async () => ({ ...runtimeResult, status: "stopped" })),
      stopForIdle: vi.fn(async () => ({ ...runtimeResult, status: "stopped" })),
      getLogs: vi.fn(),
      openExternal: vi.fn(),
      closeSessionsForWindow: vi.fn(),
      closeAll: vi.fn(),
    };
    const browserSurfaces = {
      activate: vi.fn(async (request) => ({ surfaceId: "surface-1", ...request, status: "ready" })),
      setBounds: vi.fn(() => ({ ok: true, visible: true })),
      detach: vi.fn(() => ({ ok: true })),
      runCommand: vi.fn(() => ({ ok: true })),
      destroyApp: vi.fn(),
      destroyWorkspace: vi.fn(),
      destroyOwner: vi.fn(),
      destroyAll: vi.fn(),
    };
    const service = createAppPreviewService({ runtime, browserSurfaces });
    const sender = { id: 42 };
    const request = {
      rootPath: "/workspace",
      path: "demo.puppyoneapp",
      attachmentId: "attachment-1",
      bounds: { x: 0, y: 0, width: 500, height: 400 },
    };

    const activated = await service.activate(sender, request);
    expect(activated.runtime).toBe(runtimeResult);
    expect(browserSurfaces.activate).toHaveBeenCalledWith(expect.objectContaining({
      ownerWebContentsId: 42,
      rootPath: "/workspace",
      appPath: "demo.puppyoneapp",
      runtimeId: "runtime-1",
      attachmentId: "attachment-1",
    }));

    await service.stop(sender, request);
    expect(browserSurfaces.destroyApp).toHaveBeenCalledWith(
      "/workspace",
      "demo.puppyoneapp",
      null,
      "runtime-stopped",
    );
    service.closeSessionsForWindow(42);
    expect(browserSurfaces.destroyOwner).toHaveBeenCalledWith(42, "owner-closed");
    expect(runtime.closeSessionsForWindow).toHaveBeenCalledWith(42);
  });

  it("keeps detached apps warm briefly and collects them after the idle lease expires", async () => {
    vi.useFakeTimers();
    try {
      const runtimeResult = {
        runtimeId: "runtime-1",
        appId: "app-1",
        name: "Demo",
        status: "running",
        path: "demo.puppyoneapp",
        url: "http://127.0.0.1:4173/",
      };
      const runtime = {
        start: vi.fn(async () => runtimeResult),
        restart: vi.fn(async () => runtimeResult),
        stop: vi.fn(),
        stopForIdle: vi.fn(async () => ({ ...runtimeResult, status: "stopped" })),
        getLogs: vi.fn(),
        openExternal: vi.fn(),
        closeSessionsForWindow: vi.fn(),
        closeAll: vi.fn(),
      };
      const browserSurfaces = {
        activate: vi.fn(async (request) => ({ ...request, surfaceId: "surface-1", attached: true })),
        setBounds: vi.fn(),
        detach: vi.fn(() => ({ ok: true })),
        runCommand: vi.fn(),
        destroyApp: vi.fn(),
        destroyOwner: vi.fn(),
        destroyAll: vi.fn(),
      };
      const service = createAppPreviewService({ runtime, browserSurfaces, idleTimeoutMs: 60_000 });
      const sender = { id: 42 };
      const request = {
        rootPath: "/workspace",
        path: "demo.puppyoneapp",
        attachmentId: "attachment-1",
        bounds: { x: 0, y: 0, width: 500, height: 400 },
      };

      await service.activate(sender, request);
      service.detachSurface(sender, { surfaceId: "surface-1", attachmentId: "attachment-1" });
      await vi.advanceTimersByTimeAsync(59_999);
      expect(runtime.stopForIdle).not.toHaveBeenCalled();

      await service.activate(sender, { ...request, attachmentId: "attachment-2" });
      await vi.advanceTimersByTimeAsync(1);
      expect(runtime.stopForIdle).not.toHaveBeenCalled();

      service.detachSurface(sender, { surfaceId: "surface-1", attachmentId: "attachment-2" });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(runtime.stopForIdle).toHaveBeenCalledWith({
        rootPath: "/workspace",
        path: "demo.puppyoneapp",
      });
      expect(browserSurfaces.destroyApp).toHaveBeenCalledWith(
        "/workspace",
        "demo.puppyoneapp",
        null,
        "idle-timeout",
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
