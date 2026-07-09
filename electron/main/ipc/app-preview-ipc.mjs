export function registerAppPreviewIpcHandlers({
  ipcMain,
  appPreviewRuntime,
  authorizeWorkspaceRoot,
}) {
  ipcMain.handle("app-preview:start", async (event, request) => {
    return appPreviewRuntime.start(event.sender, await authorizeRequestRoot(event, request, authorizeWorkspaceRoot));
  });

  ipcMain.handle("app-preview:restart", async (event, request) => {
    return appPreviewRuntime.restart(event.sender, await authorizeRequestRoot(event, request, authorizeWorkspaceRoot));
  });

  ipcMain.handle("app-preview:stop", async (event, request) => {
    return appPreviewRuntime.stop(event.sender, await authorizeRequestRoot(event, request, authorizeWorkspaceRoot));
  });

  ipcMain.handle("app-preview:get-logs", async (event, request) => {
    return appPreviewRuntime.getLogs(event.sender, await authorizeRequestRoot(event, request, authorizeWorkspaceRoot));
  });

  ipcMain.handle("app-preview:open-external", async (event, request) => {
    await appPreviewRuntime.openExternal(
      event.sender,
      await authorizeRequestRoot(event, request, authorizeWorkspaceRoot),
    );
    return { ok: true };
  });
}

async function authorizeRequestRoot(event, request, authorizeWorkspaceRoot) {
  const rootPath = await authorizeWorkspaceRoot(event, request?.rootPath);
  return {
    ...(request && typeof request === "object" ? request : {}),
    rootPath,
  };
}
