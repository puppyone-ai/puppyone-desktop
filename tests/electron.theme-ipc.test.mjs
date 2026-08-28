import { describe, expect, it, vi } from "vitest";
import {
  THEME_LIST_CHANNEL,
  THEME_OPEN_DIRECTORY_CHANNEL,
  THEME_RELOAD_CHANNEL,
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
    };

    registerThemeIpcHandlers({ ipcMain, themeService });

    expect([...handlers.keys()]).toEqual([
      THEME_LIST_CHANNEL,
      THEME_RELOAD_CHANNEL,
      THEME_OPEN_DIRECTORY_CHANNEL,
    ]);
    await expect(handlers.get(THEME_LIST_CHANNEL)({})).resolves.toBe(snapshot);
    await expect(handlers.get(THEME_RELOAD_CHANNEL)({}, { ignoredPath: "/tmp" })).resolves.toBe(snapshot);
    await expect(handlers.get(THEME_OPEN_DIRECTORY_CHANNEL)({}, "/tmp")).resolves.toEqual({ opened: true });
    expect(themeService.listThemes).toHaveBeenCalledTimes(2);
    expect(themeService.openDirectory).toHaveBeenCalledExactlyOnceWith();
  });

  it("requires the trusted IPC and theme service ports", () => {
    expect(() => registerThemeIpcHandlers({ ipcMain: null, themeService: {} }))
      .toThrow("Trusted ipcMain is required");
    expect(() => registerThemeIpcHandlers({ ipcMain: { handle() {} }, themeService: {} }))
      .toThrow("Theme service is required");
  });
});
