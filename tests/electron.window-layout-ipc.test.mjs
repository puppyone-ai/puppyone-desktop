import { describe, expect, it, vi } from "vitest";
import { registerWindowLayoutIpcHandlers } from "../electron/main/ipc/window-layout-ipc.mjs";

describe("native window layout IPC", () => {
  it("raises the native minimum and expands an already narrower window", () => {
    const ownerWindow = createWindow({ width: 640 });
    const handler = register(ownerWindow);

    expect(handler(createEvent(), { width: 888 })).toEqual({
      applied: true,
      width: 888,
    });
    expect(ownerWindow.setMinimumSize).toHaveBeenCalledWith(888, 640);
    expect(ownerWindow.setSize).toHaveBeenCalledWith(888, 840, true);
  });

  it("never lowers the product-level 640px floor", () => {
    const ownerWindow = createWindow({ width: 900 });
    const handler = register(ownerWindow);

    expect(handler(createEvent(), { width: 320 })).toEqual({
      applied: true,
      width: 640,
    });
    expect(ownerWindow.setMinimumSize).toHaveBeenCalledWith(640, 640);
    expect(ownerWindow.setSize).not.toHaveBeenCalled();
  });

  it("ignores a renderer whose BrowserWindow has already been destroyed", () => {
    const ownerWindow = createWindow({ destroyed: true });
    const handler = register(ownerWindow);

    expect(handler(createEvent(), { width: 888 })).toEqual({ applied: false });
    expect(ownerWindow.setMinimumSize).not.toHaveBeenCalled();
  });

  it("reports the native full-screen state for adaptive window chrome", () => {
    const ownerWindow = createWindow({ fullScreen: true });
    const handlers = registerHandlers(ownerWindow);

    expect(handlers.get("window-layout:get-chrome-state")(createEvent())).toEqual({
      fullScreen: true,
    });
  });
});

function register(ownerWindow) {
  const handlers = registerHandlers(ownerWindow);
  const handler = handlers.get("window-layout:set-minimum-width");
  if (!handler) throw new Error("Window layout IPC handler was not registered.");
  return handler;
}

function registerHandlers(ownerWindow) {
  const handlers = new Map();
  registerWindowLayoutIpcHandlers({
    ipcMain: {
      handle: (channel, listener) => {
        handlers.set(channel, listener);
      },
    },
    BrowserWindow: {
      fromWebContents: () => ownerWindow,
    },
  });
  return handlers;
}

function createWindow({ destroyed = false, fullScreen = false, width = 900 } = {}) {
  return {
    getMinimumSize: vi.fn(() => [640, 640]),
    getSize: vi.fn(() => [width, 840]),
    isDestroyed: vi.fn(() => destroyed),
    isFullScreen: vi.fn(() => fullScreen),
    setMinimumSize: vi.fn(),
    setSize: vi.fn(),
  };
}

function createEvent() {
  return { sender: { id: 1 } };
}
