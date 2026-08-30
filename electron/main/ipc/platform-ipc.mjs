export function registerPlatformIpcHandlers({ ipcMain, platformHost }) {
  if (!platformHost || typeof platformHost.getCapabilities !== "function") {
    throw new TypeError("Platform IPC requires a Desktop platform host.");
  }
  const snapshot = platformHost.getCapabilities();
  ipcMain.handle("platform:get-capabilities", () => snapshot);
}
