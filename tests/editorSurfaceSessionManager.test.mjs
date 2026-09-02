import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEditorSurfaceSessionManager } from "../electron/main/editor-surfaces/session-manager.mjs";

const createdViews = [];
let nextWebContentsId = 100;

class FakeWebContents extends EventEmitter {
  constructor() {
    super();
    this.id = nextWebContentsId++;
    this.destroyed = false;
    this.sent = [];
  }

  async loadURL(url) { this.url = url; }
  send(channel, payload) { this.sent.push([channel, payload]); }
  setWindowOpenHandler(handler) { this.windowOpenHandler = handler; }
  setAudioMuted(muted) { this.audioMuted = muted; }
  getOSProcessId() { return this.id + 1_000; }
  isDestroyed() { return this.destroyed; }
  destroy() { this.destroyed = true; }
  forcefullyCrashRenderer() { this.emit("render-process-gone", {}, { reason: "killed", exitCode: 137 }); }
}

class FakeWebContentsView {
  constructor(options) {
    this.options = options;
    this.webContents = new FakeWebContents();
    this.visible = true;
    this.bounds = null;
    createdViews.push(this);
  }

  setBounds(bounds) { this.bounds = bounds; }
  getBounds() { return this.bounds; }
  setVisible(visible) { this.visible = visible; }
}

class FakeOwnerWindow extends EventEmitter {
  constructor(id) {
    super();
    this.destroyed = false;
    this.children = [];
    this.webContents = new EventEmitter();
    this.webContents.id = id;
    this.webContents.sent = [];
    this.webContents.destroyed = false;
    this.webContents.isDestroyed = () => this.webContents.destroyed;
    this.webContents.send = (channel, payload) => this.webContents.sent.push([channel, payload]);
    this.contentView = {
      addChildView: (view) => this.children.push(view),
      removeChildView: (view) => {
        const index = this.children.indexOf(view);
        if (index >= 0) this.children.splice(index, 1);
      },
    };
  }

  getContentSize() { return [1_200, 800]; }
  isDestroyed() { return this.destroyed; }
}

function request(ownerWebContentsId = 7) {
  return {
    ownerWebContentsId,
    viewerId: "pdf-preview",
    documentPath: "reports/large.pdf",
    documentRevision: "revision:1",
    resourceUrl: "puppyone-local://file/token/file-preview/reports/large.pdf",
    title: "large.pdf",
    safeMode: false,
    bounds: { x: 20, y: 30, width: 800, height: 600 },
    appearance: { dark: true, direction: "ltr", attributes: {}, variables: {} },
  };
}

function createHarness(owner) {
  const partition = {
    setPermissionRequestHandler: vi.fn(),
    setPermissionCheckHandler: vi.fn(),
    clearStorageData: vi.fn(async () => undefined),
  };
  const releasePartition = vi.fn();
  const manager = createEditorSurfaceSessionManager({
    WebContentsView: FakeWebContentsView,
    sessionFromPartition: vi.fn(() => partition),
    getOwnerWindow: (id) => id === owner.webContents.id ? owner : null,
    preloadPath: "/app/editor-surface-preload.cjs",
    surfaceUrl: "file:///app/dist/isolated-editor.html",
    configurePartition: vi.fn(() => releasePartition),
  });
  return { manager, partition, releasePartition };
}

describe("built-in Editor Surface fault domain", () => {
  beforeEach(() => {
    createdViews.length = 0;
    nextWebContentsId = 100;
  });

  it("launches PDF in a sandboxed process and publishes first-frame readiness", async () => {
    const owner = new FakeOwnerWindow(7);
    const { manager, partition } = createHarness(owner);
    const session = await manager.activate(request());
    const view = createdViews[0];

    expect(view.options.webPreferences).toMatchObject({
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      session: partition,
    });
    expect(view.webContents.url).toBe("file:///app/dist/isolated-editor.html");
    expect(view.webContents.sent.at(-1)).toEqual([
      "editor-surface:initialize",
      expect.objectContaining({ sessionId: session.sessionId, viewerId: "pdf-preview" }),
    ]);
    expect(view.webContents.sent.at(-1)[1].resourcePolicy).toMatchObject({
      maxCanvasPixels: 8_388_608,
      maxActiveCanvases: 6,
      maxWorkers: 1,
    });

    expect(manager.reportReady(session.sessionId, view.webContents.id)).toBe(true);
    expect(owner.webContents.sent.at(-1)).toEqual([
      "editor-surface:state",
      expect.objectContaining({ sessionId: session.sessionId, status: "ready" }),
    ]);
  });

  it("contains an out-of-memory crash to one Editor Surface", async () => {
    const owner = new FakeOwnerWindow(7);
    const { manager, releasePartition } = createHarness(owner);
    const first = await manager.activate(request());
    const second = await manager.activate({ ...request(), documentPath: "reports/sibling.pdf" });

    createdViews[0].webContents.emit(
      "render-process-gone",
      {},
      { reason: "oom", exitCode: 137 },
    );

    expect(owner.destroyed).toBe(false);
    expect(manager.values().map(({ sessionId }) => sessionId)).toEqual([second.sessionId]);
    expect(owner.children).toEqual([createdViews[1]]);
    expect(releasePartition).toHaveBeenCalledOnce();
    expect(owner.webContents.sent).toContainEqual([
      "editor-surface:state",
      expect.objectContaining({ sessionId: first.sessionId, status: "crashed", reason: "oom" }),
    ]);
  });

  it("restores a ready surface after a transient unresponsive event", async () => {
    const owner = new FakeOwnerWindow(7);
    const { manager } = createHarness(owner);
    const session = await manager.activate(request());
    const view = createdViews[0];

    manager.reportReady(session.sessionId, view.webContents.id);
    view.webContents.emit("unresponsive");
    expect(view.visible).toBe(false);

    view.webContents.emit("responsive");
    expect(view.visible).toBe(true);
    expect(owner.webContents.sent.at(-1)).toEqual([
      "editor-surface:state",
      expect.objectContaining({ sessionId: session.sessionId, status: "ready" }),
    ]);
  });

  it("rejects non-isolated Viewers and non-capability resource URLs", async () => {
    const owner = new FakeOwnerWindow(7);
    const { manager } = createHarness(owner);

    await expect(manager.activate({ ...request(), viewerId: "markdown" }))
      .rejects.toThrow(/not admitted/i);
    await expect(manager.activate({ ...request(), resourceUrl: "file:///tmp/private.pdf" }))
      .rejects.toThrow(/not allowed/i);
    expect(createdViews).toHaveLength(0);
  });
});
