export function registerAppPreviewIpcHandlers({ ipcMain, appPreviewRuntime }) {
  ipcMain.handle("app-preview:start", async (event, request) => {
    return appPreviewRuntime.start(event.sender, request);
  });

  ipcMain.handle("app-preview:restart", async (event, request) => {
    return appPreviewRuntime.restart(event.sender, request);
  });

  ipcMain.handle("app-preview:stop", async (event, request) => {
    return appPreviewRuntime.stop(event.sender, request);
  });

  ipcMain.handle("app-preview:get-logs", async (event, request) => {
    return appPreviewRuntime.getLogs(event.sender, request);
  });

  ipcMain.handle("app-preview:open-external", async (event, request) => {
    await appPreviewRuntime.openExternal(event.sender, request);
    return { ok: true };
  });
}
