export function registerSystemIpcHandlers({ ipcMain, externalNavigation }) {
  ipcMain.handle("system:open-external-url", async (_event, href) => {
    await externalNavigation.open(href);
    return { ok: true };
  });
}
