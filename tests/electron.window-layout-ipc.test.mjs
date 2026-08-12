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
});

function register(ownerWindow) {
  let handler;
  registerWindowLayoutIpcHandlers({
    ipcMain: {
      handle: (channel, listener) => {
        expect(channel).toBe("window-layout:set-minimum-width");
        handler = listener;
      },
    },
    BrowserWindow: {
      fromWebContents: () => ownerWindow,
    },
  });
  if (!handler) throw new Error("Window layout IPC handler was not registered.");
  return handler;
}

function createWindow({ destroyed = false, width = 900 } = {}) {
  return {
    getMinimumSize: vi.fn(() => [640, 640]),
    getSize: vi.fn(() => [width, 840]),
    isDestroyed: vi.fn(() => destroyed),
    setMinimumSize: vi.fn(),
    setSize: vi.fn(),
  };
}

function createEvent() {
  return { sender: { id: 1 } };
}
