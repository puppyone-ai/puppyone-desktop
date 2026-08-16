export function registerSystemIpcHandlers({ ipcMain, externalNavigation, setDockIcon }) {
  ipcMain.handle("system:open-external-url", async (_event, href) => {
    await externalNavigation.open(href);
    return { ok: true };
  });

  ipcMain.handle("system:set-dock-icon", (_event, iconId) => setDockIcon(iconId));
}
