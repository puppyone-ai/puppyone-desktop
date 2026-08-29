import { describe, expect, it, vi } from "vitest";
import {
  THEME_LIST_CHANNEL,
  THEME_OPEN_DIRECTORY_CHANNEL,
  THEME_READ_CUSTOM_CSS_CHANNEL,
  THEME_RELOAD_CHANNEL,
  THEME_SAVE_CUSTOM_CSS_CHANNEL,
  THEME_SYNC_NATIVE_MENU_CHANNEL,
  registerThemeIpcHandlers,
} from "../electron/main/ipc/theme-ipc.mjs";

describe("CSS theme IPC", () => {
  it("registers narrow list, reload, and open-directory handlers", async () => {
    const handlers = new Map();
    const ipcMain = {
      handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
    };
    const snapshot = { themes: [], diagnostics: [] };
    const themeService = {
      listThemes: vi.fn(async () => snapshot),
      openDirectory: vi.fn(async () => ({ opened: true })),
      readCustomCss: vi.fn(async () => ({ css: "body {}" })),
      saveCustomCss: vi.fn(async () => ({ saved: true })),
    };
    const onSyncNativeMenu = vi.fn();

    registerThemeIpcHandlers({ ipcMain, themeService, onSyncNativeMenu });

    expect([...handlers.keys()]).toEqual([
      THEME_LIST_CHANNEL,
      THEME_RELOAD_CHANNEL,
      THEME_OPEN_DIRECTORY_CHANNEL,
      THEME_READ_CUSTOM_CSS_CHANNEL,
      THEME_SAVE_CUSTOM_CSS_CHANNEL,
      THEME_SYNC_NATIVE_MENU_CHANNEL,
    ]);
    await expect(handlers.get(THEME_LIST_CHANNEL)({})).resolves.toBe(snapshot);
    await expect(handlers.get(THEME_RELOAD_CHANNEL)({}, { ignoredPath: "/tmp" })).resolves.toBe(snapshot);
    await expect(handlers.get(THEME_OPEN_DIRECTORY_CHANNEL)({}, "/tmp")).resolves.toEqual({ opened: true });
    expect(themeService.listThemes).toHaveBeenCalledTimes(2);
    expect(themeService.openDirectory).toHaveBeenCalledExactlyOnceWith();
    await expect(handlers.get(THEME_READ_CUSTOM_CSS_CHANNEL)({}, { target: "markdown" }))
      .resolves.toEqual({ css: "body {}" });
    await expect(handlers.get(THEME_SAVE_CUSTOM_CSS_CHANNEL)({}, {
      target: "markdown",
      css: "body {}",
    })).resolves.toEqual({ saved: true });
    expect(handlers.get(THEME_SYNC_NATIVE_MENU_CHANNEL)({}, {
      pack: "builtin.pack.forest",
      themes: [{ id: "builtin.markdown.focus", name: "Focus", targets: ["markdown", "invalid"] }],
    })).toEqual({ synced: true });
    expect(onSyncNativeMenu).toHaveBeenCalledWith({
      pack: "builtin.pack.forest",
      themes: [{ id: "builtin.markdown.focus", name: "Focus", targets: ["markdown"] }],
    });
  });

  it("requires the trusted IPC and theme service ports", () => {
    expect(() => registerThemeIpcHandlers({ ipcMain: null, themeService: {} }))
      .toThrow("Trusted ipcMain is required");
    expect(() => registerThemeIpcHandlers({ ipcMain: { handle() {} }, themeService: {} }))
      .toThrow("Theme service is required");
  });
});
