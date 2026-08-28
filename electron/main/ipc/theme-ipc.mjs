export const THEME_LIST_CHANNEL = "theme:list";
export const THEME_RELOAD_CHANNEL = "theme:reload";
export const THEME_OPEN_DIRECTORY_CHANNEL = "theme:open-directory";

export function registerThemeIpcHandlers({ ipcMain, themeService }) {
  if (!ipcMain || typeof ipcMain.handle !== "function") {
    throw new TypeError("Trusted ipcMain is required for theme IPC.");
  }
  if (
    !themeService
    || typeof themeService.listThemes !== "function"
    || typeof themeService.openDirectory !== "function"
  ) {
    throw new TypeError("Theme service is required for theme IPC.");
  }

  ipcMain.handle(THEME_LIST_CHANNEL, () => themeService.listThemes());
  ipcMain.handle(THEME_RELOAD_CHANNEL, () => themeService.listThemes());
  ipcMain.handle(THEME_OPEN_DIRECTORY_CHANNEL, () => themeService.openDirectory());
}
