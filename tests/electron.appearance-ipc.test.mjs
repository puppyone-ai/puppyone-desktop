import { describe, expect, it, vi } from "vitest";
import {
  APPEARANCE_WINDOW_BACKGROUND_CHANNEL,
  registerAppearanceIpcHandlers,
} from "../electron/main/ipc/appearance-ipc.mjs";

describe("native appearance IPC", () => {
  it("applies a manifest-owned first-paint color to the sender's window", () => {
    const ownerWindow = createWindow();
    const handler = register(ownerWindow);

    handler(createEvent(), { background: "#fafafa" });

    expect(ownerWindow.setBackgroundColor).toHaveBeenCalledWith("#fafafa");
  });

  it("rejects colors that are not owned by the interface-style manifest", () => {
    const ownerWindow = createWindow();
    const handler = register(ownerWindow);

    handler(createEvent(), { background: "#ff00ff" });
    handler(createEvent(), { background: "linear-gradient(red, blue)" });

    expect(ownerWindow.setBackgroundColor).not.toHaveBeenCalled();
  });

  it("does not touch a destroyed sender window", () => {
    const ownerWindow = createWindow({ destroyed: true });
    const handler = register(ownerWindow);

    handler(createEvent(), { background: "#161413" });

    expect(ownerWindow.setBackgroundColor).not.toHaveBeenCalled();
  });
});

function register(ownerWindow) {
  let handler;
  registerAppearanceIpcHandlers({
    ipcMain: {
      on: (channel, listener) => {
        expect(channel).toBe(APPEARANCE_WINDOW_BACKGROUND_CHANNEL);
        handler = listener;
      },
    },
    BrowserWindow: {
      fromWebContents: () => ownerWindow,
    },
  });
  if (!handler) throw new Error("Appearance IPC handler was not registered.");
  return handler;
}

function createWindow({ destroyed = false } = {}) {
  return {
    isDestroyed: vi.fn(() => destroyed),
    setBackgroundColor: vi.fn(),
  };
}

function createEvent() {
  return { sender: { id: 1 } };
}
