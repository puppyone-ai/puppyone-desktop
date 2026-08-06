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
    expect(browserSurfaces.destroyWorkspace).toHaveBeenCalledWith(
      "/workspace",
      42,
      "runtime-stopped",
    );
    service.closeSessionsForWindow(42);
    expect(browserSurfaces.destroyOwner).toHaveBeenCalledWith(42, "owner-closed");
    expect(runtime.closeSessionsForWindow).toHaveBeenCalledWith(42);
  });
});
