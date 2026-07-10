import { describe, expect, it } from "vitest";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createViewerPackHost,
  registerViewerPackAppIpcHandlers,
  registerViewerPackPluginIpcHandlers,
  VIEWER_PACK_APP_IPC_CHANNELS,
  VIEWER_PACK_PLUGIN_IPC_CHANNELS,
} from "../../electron/main/viewer-packs/index.mjs";

function createFakeIpc() {
  const handlers = new Map();
  return {
    handle(channel, listener) {
      handlers.set(channel, listener);
    },
    on(channel, listener) {
      handlers.set(`on:${channel}`, listener);
    },
    async invoke(channel, event, ...args) {
      const listener = handlers.get(channel);
      if (!listener) throw new Error(`No handler for ${channel}`);
      return listener(event, ...args);
    },
    has(channel) {
      return handlers.has(channel);
    },
  };
}

describe("viewer pack ipc separation", () => {
  it("registers app channels separately from plugin channels", async () => {
    const userDataPath = await fsp.mkdtemp(path.join(os.tmpdir(), "vp-ipc-"));

    const host = createViewerPackHost({
      WebContentsView: class {
        constructor() {
          this.webContents = { id: 99, loadURL: async () => undefined, destroy: () => undefined };
        }
        setBounds() {}
      },
      sessionFromPartition: () => ({
        setPermissionRequestHandler() {},
        setPermissionCheckHandler() {},
        webRequest: { onBeforeRequest() {} },
        protocol: { handle() {} },
        clearStorageData: async () => undefined,
      }),
      getOwnerWindow: () => ({
        isDestroyed: () => false,
        contentView: { addChildView() {}, removeChildView() {} },
      }),
      userDataPath,
      allowTestKeys: true,
      allowFileFallback: true,
    });

    const trusted = createFakeIpc();
    const raw = createFakeIpc();
    registerViewerPackAppIpcHandlers({ ipcMain: trusted, host });
    registerViewerPackPluginIpcHandlers({ ipcMain: raw, host });

    for (const channel of Object.values(VIEWER_PACK_APP_IPC_CHANNELS)) {
      expect(trusted.has(channel)).toBe(true);
      expect(raw.has(channel)).toBe(false);
    }
    for (const channel of Object.values(VIEWER_PACK_PLUGIN_IPC_CHANNELS)) {
      if (channel === VIEWER_PACK_PLUGIN_IPC_CHANNELS.uiSetState) {
        expect(raw.has(`on:${channel}`)).toBe(true);
      } else {
        expect(raw.has(channel)).toBe(true);
      }
      expect(trusted.has(channel)).toBe(false);
    }

    await expect(raw.invoke(
      VIEWER_PACK_PLUGIN_IPC_CHANNELS.documentGetMeta,
      { sender: { id: 12345 } },
    )).rejects.toThrow(/No active viewer pack session/);
  });
});
