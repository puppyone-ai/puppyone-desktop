import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createOfficeEditingSurfaceManager } from "../electron/main/office/office-editing-surface.mjs";

describe("Office editing native surface", () => {
  it("loads the engine in an isolated WebContentsView and clips it to the owner viewport", async () => {
    const createdViews = [];
    class FakeWebContentsView {
      constructor(options) {
        this.options = options;
        this.bounds = null;
        this.visible = false;
        this.webContents = Object.assign(new EventEmitter(), {
          loadURL: vi.fn(async () => undefined),
          executeJavaScript: vi.fn(async () => true),
          setWindowOpenHandler: vi.fn(),
          close: vi.fn(),
          isDestroyed: () => false,
        });
        createdViews.push(this);
      }
      setBounds(bounds) { this.bounds = bounds; }
      setVisible(visible) { this.visible = visible; }
    }
    const ownerWebContents = Object.assign(new EventEmitter(), { id: 51, isDestroyed: () => false });
    const ownerWindow = Object.assign(new EventEmitter(), {
      webContents: ownerWebContents,
      isDestroyed: () => false,
      isVisible: () => true,
      isMinimized: () => false,
      getContentBounds: () => ({ x: 100, y: 100, width: 900, height: 700 }),
      contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
    });
    const partitionSession = {
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
      clearStorageData: vi.fn(async () => undefined),
      clearCache: vi.fn(async () => undefined),
    };
    const manager = createOfficeEditingSurfaceManager({
      WebContentsView: FakeWebContentsView,
      sessionFromPartition: vi.fn(() => partitionSession),
      getOwnerWindow: (ownerId) => ownerId === 51 ? ownerWindow : null,
    });

    const result = await manager.attach({
      ownerId: 51,
      sessionId: "session-1",
      attachmentId: "attachment-1",
      apiScriptUrl: "https://office.example.test/web-apps/apps/api/documents/api.js",
      editorConfig: { token: "signed-config", document: { key: "key-1" } },
      bounds: { x: 850, y: 650, width: 200, height: 200 },
    });

    const view = createdViews[0];
    expect(view.options.webPreferences).toMatchObject({
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
      devTools: false,
    });
    expect(view.webContents.loadURL).toHaveBeenCalledWith(expect.stringMatching(/^data:text\/html/));
    expect(decodeURIComponent(view.webContents.loadURL.mock.calls[0][0])).toContain("script-src https://office.example.test");
    expect(view.webContents.executeJavaScript.mock.calls[0][0]).toContain("signed-config");
    expect(ownerWindow.contentView.addChildView).toHaveBeenCalledWith(view);
    expect(view.bounds).toEqual({ x: 850, y: 650, width: 50, height: 50 });
    expect(view.visible).toBe(true);

    expect(manager.setBounds({
      ownerId: 51,
      surfaceId: result.surfaceId,
      attachmentId: "attachment-1",
      bounds: { x: 10, y: 20, width: 500, height: 400 },
    })).toEqual({ ok: true, visible: true });
    expect(view.bounds).toEqual({ x: 10, y: 20, width: 500, height: 400 });
    expect(() => manager.setBounds({
      ownerId: 52,
      surfaceId: result.surfaceId,
      attachmentId: "attachment-1",
      bounds: { x: 0, y: 0, width: 1, height: 1 },
    })).toThrow(/unavailable/i);

    expect(manager.detach({
      ownerId: 51,
      surfaceId: result.surfaceId,
      attachmentId: "attachment-1",
    })).toEqual({ detached: true });
    expect(ownerWindow.contentView.removeChildView).toHaveBeenCalledWith(view);
    expect(view.webContents.close).toHaveBeenCalled();
  });
});
