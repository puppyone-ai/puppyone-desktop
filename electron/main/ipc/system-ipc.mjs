import { requireSafeExternalUrl } from "../security.mjs";

export function registerSystemIpcHandlers({ ipcMain, shell }) {
  ipcMain.handle("system:open-external-url", async (_event, href) => {
    const url = requireSafeExternalUrl(href);
    await shell.openExternal(url);
    return { ok: true };
  });
}
