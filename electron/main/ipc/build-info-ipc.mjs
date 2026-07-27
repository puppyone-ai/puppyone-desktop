import { assertDesktopBuildInfo } from "../../../shared/desktop-build-identity.mjs";

export function registerBuildInfoIpcHandlers({ ipcMain, buildInfo }) {
  const snapshot = assertDesktopBuildInfo(buildInfo);
  ipcMain.handle("build-info:get", () => snapshot);
}
