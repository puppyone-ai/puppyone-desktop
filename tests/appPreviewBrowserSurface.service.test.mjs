import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAppPreviewBrowserSurfaceManager } from "../electron/main/app-preview-browser-surface.mjs";

const DEFAULT_REQUEST = Object.freeze({
  ownerWebContentsId: 7,
  rootPath: "/workspace",
  runtimeId: "runtime-1",
  appId: "app-1",
  appPath: "demo.puppyoneapp",
  url: "http://127.0.0.1:4173/",
  bounds: { x: 20, y: 30, width: 500, height: 300 },
  attachmentId: "attachment-1",
});

let createdViews;
let createdSessions;

class FakeSession extends EventEmitter {
  constructor() {
    super();
    this.clearStorageData = vi.fn(async () => {});
    this.closeAllConnections = vi.fn(async () => {});
  }

  setPermissionRequestHandler(handler) {
    this.permissionRequestHandler = handler;
  }

  setPermissionCheckHandler(handler) {
    this.permissionCheckHandler = handler;
  }
}

class FakeWebContents extends EventEmitter {
  constructor() {
    super();
    this.destroyed = false;
    this.currentUrl = "";
    this.title = "Preview";
    this.loadImplementation = async () => {};
    this.navigationHistory = {
      canGoBack: vi.fn(() => false),
      canGoForward: vi.fn(() => false),
      goBack: vi.fn(),
      goForward: vi.fn(),
    };
    this.reload = vi.fn();
    this.setAudioMuted = vi.fn();
  }

  setWindowOpenHandler(handler) {
    this.windowOpenHandler = handler;
  }

  async loadURL(url) {
    this.currentUrl = url;
    await this.loadImplementation(url);
  }

  getURL() {
    return this.currentUrl;
  }

  getTitle() {
    return this.title;
  }

  isDestroyed() {
    return this.destroyed;
  }

  destroy() {
    this.destroyed = true;
  }

  close() {
    this.destroyed = true;
  }

  stop() {}
}

class FakeWebContentsView {
  constructor(options) {
    this.options = options;
    this.webContents = new FakeWebContents();
    this.setBounds = vi.fn();
    this.setVisible = vi.fn();
    createdViews.push(this);
  }
}

class FakeWindow extends EventEmitter {
  constructor(id = 7) {
    super();
    this.destroyed = false;
    this.visible = true;
    this.minimized = false;
    this.children = [];
    this.webContents = new EventEmitter();
    this.webContents.id = id;
    this.webContents.isDestroyed = () => false;
    this.contentView = {
      addChildView: vi.fn((view) => {
        if (!this.children.includes(view)) this.children.push(view);
      }),
      removeChildView: vi.fn((view) => {
        this.children = this.children.filter((candidate) => candidate !== view);
      }),
    };
  }

  isDestroyed() {
    return this.destroyed;
  }

  isVisible() {
    return this.visible;
  }

  isMinimized() {
    return this.minimized;
  }

  getContentBounds() {
    return { x: 0, y: 0, width: 800, height: 600 };
  }
}

function createHarness() {
  const window = new FakeWindow();
  const states = [];
  const manager = createAppPreviewBrowserSurfaceManager({
    WebContentsView: FakeWebContentsView,
    sessionFromPartition: (partition, options) => {
      const session = new FakeSession();
      createdSessions.push({ partition, options, session });
      return session;
    },
    getOwnerWindow: (id) => id === window.webContents.id ? window : null,
    publishState: (state, ownerId) => states.push({ state, ownerId }),
    loadTimeoutMs: 500,
  });
  return { manager, states, window };
}

describe("App Preview browser surface manager", () => {
  beforeEach(() => {
    createdViews = [];
    createdSessions = [];
  });

  it("creates an isolated, clipped native surface and denies browser capabilities", async () => {
    const { manager, window } = createHarness();
    const result = await manager.activate({
      ...DEFAULT_REQUEST,
      bounds: { x: 700, y: 550, width: 200, height: 100 },
    });

    expect(result.status).toBe("ready");
    expect(result.attached).toBe(true);
    expect(window.children).toEqual([createdViews[0]]);
    expect(createdViews[0].setBounds).toHaveBeenLastCalledWith({ x: 700, y: 550, width: 100, height: 50 });
    expect(createdViews[0].options.webPreferences).toMatchObject({
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webviewTag: false,
      webSecurity: true,
      devTools: false,
    });
    expect(createdSessions[0].partition).toMatch(/^temp:app-surface-/);
    expect(createdSessions[0].options).toEqual({ cache: true });

    const partition = createdSessions[0].session;
    expect(partition.permissionCheckHandler()).toBe(false);
    const permissionCallback = vi.fn();
    partition.permissionRequestHandler(null, "camera", permissionCallback);
    expect(permissionCallback).toHaveBeenCalledWith(false);
    const download = { preventDefault: vi.fn() };
    partition.emit("will-download", download);
    expect(download.preventDefault).toHaveBeenCalled();
    expect(createdViews[0].webContents.windowOpenHandler()).toEqual({ action: "deny" });
  });

  it("reuses the same page across detach and reattach", async () => {
    const { manager, window } = createHarness();
    const first = await manager.activate(DEFAULT_REQUEST);
    expect(manager.detach({
      surfaceId: first.surfaceId,
      attachmentId: "attachment-1",
      callerWebContentsId: 7,
    })).toEqual({ ok: true });
    expect(window.children).toHaveLength(0);

    const second = await manager.activate({ ...DEFAULT_REQUEST, attachmentId: "attachment-2" });
    expect(second.surfaceId).toBe(first.surfaceId);
    expect(createdViews).toHaveLength(1);
    expect(window.children).toEqual([createdViews[0]]);
  });

  it("ignores stale attachment cleanup after a newer lease is active", async () => {
    const { manager, window } = createHarness();
    const first = await manager.activate(DEFAULT_REQUEST);
    const second = await manager.activate({ ...DEFAULT_REQUEST, attachmentId: "attachment-2" });

    expect(manager.detach({
      surfaceId: first.surfaceId,
      attachmentId: "attachment-1",
      callerWebContentsId: 7,
    })).toEqual({ ok: false });
    expect(window.children).toHaveLength(1);
    expect(manager.detach({
      surfaceId: second.surfaceId,
      attachmentId: "attachment-2",
      callerWebContentsId: 7,
    })).toEqual({ ok: true });
    expect(window.children).toHaveLength(0);
  });

  it("honors cleanup that arrives before asynchronous activation finishes", async () => {
    const { manager, window } = createHarness();
    let finishLoad;
    const activation = manager.activate({ ...DEFAULT_REQUEST, attachmentId: "cancel-me" });
    await vi.waitFor(() => expect(createdViews).toHaveLength(1));
    createdViews[0].webContents.loadImplementation = () => new Promise((resolve) => {
      finishLoad = resolve;
    });
    // A second URL forces the controlled load implementation to run.
    const pending = manager.activate({
      ...DEFAULT_REQUEST,
      url: "http://127.0.0.1:4174/",
      attachmentId: "cancel-before-load",
    });
    await vi.waitFor(() => expect(typeof finishLoad).toBe("function"));
    expect(manager.detach({
      attachmentId: "cancel-before-load",
      callerWebContentsId: 7,
    })).toEqual({ ok: true });
    finishLoad();
    await activation;
    const result = await pending;

    expect(result.attached).toBe(false);
    expect(window.children).toHaveLength(0);
  });

  it("keeps independent app pages while attaching only the active one and blocks cross-owner mutations", async () => {
    const { manager, window } = createHarness();
    const first = await manager.activate(DEFAULT_REQUEST);
    const second = await manager.activate({
      ...DEFAULT_REQUEST,
      runtimeId: "runtime-2",
      appId: "app-2",
      appPath: "other.puppyoneapp",
      attachmentId: "attachment-2",
    });

    expect(second.surfaceId).not.toBe(first.surfaceId);
    expect(createdViews).toHaveLength(2);
    expect(createdViews[0].webContents.destroyed).toBe(false);
    expect(window.children).toEqual([createdViews[1]]);
    expect(manager.setBounds({
      surfaceId: second.surfaceId,
      attachmentId: "attachment-2",
      callerWebContentsId: 99,
      bounds: DEFAULT_REQUEST.bounds,
    })).toEqual({ ok: false, visible: false });

    const restored = await manager.activate({
      ...DEFAULT_REQUEST,
      attachmentId: "attachment-3",
    });
    expect(restored.surfaceId).toBe(first.surfaceId);
    expect(createdViews).toHaveLength(2);
    expect(window.children).toEqual([createdViews[0]]);
  });

  it("keeps top-level navigation on the exact local runtime origin", async () => {
    const { manager } = createHarness();
    await manager.activate(DEFAULT_REQUEST);
    const webContents = createdViews[0].webContents;
    const navigate = (url) => {
      const event = { preventDefault: vi.fn() };
      webContents.emit("will-navigate", event, url);
      return event.preventDefault;
    };

    expect(navigate("http://127.0.0.1:4173/dashboard")).not.toHaveBeenCalled();
    expect(navigate("http://127.0.0.1:9999/")).toHaveBeenCalled();
    expect(navigate("https://example.com/")).toHaveBeenCalled();
  });
});
