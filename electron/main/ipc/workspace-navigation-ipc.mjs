export function registerWorkspaceNavigationIpcHandlers({
  ipcMain,
  workspaceStateStore,
  getInitialWorkspaceResultForWindow,
  forgetCurrentWindowWorkspace,
  showHomepageForCurrentWindow,
  openWorkspaceInCurrentWindow,
  openWorkspaceInNewWindow,
  createCloudWorkspaceFromRequest,
  openVirtualWorkspaceInNewWindow,
  selectWorkspaceForCurrentWindow,
  selectWorkspaceForNewWindow,
}) {
  ipcMain.handle("window:get-initial-workspace", async (event) => {
    return getInitialWorkspaceResultForWindow(event.sender);
  });

  ipcMain.handle("workspace:get-last", async () => {
    return workspaceStateStore.getLastWorkspaceResult();
  });

  ipcMain.handle("workspace:get-recent", async () => {
    return workspaceStateStore.getRecentWorkspacesResult();
  });

  ipcMain.handle("workspace:forget-last", async (event) => {
    await forgetCurrentWindowWorkspace(event.sender);
    return { ok: true };
  });

  ipcMain.handle("workspace:show-homepage", async (event) => {
    await showHomepageForCurrentWindow(event.sender);
    return { ok: true };
  });

  ipcMain.handle("workspace:open-current", async (event, folderPath) => {
    const persistedPath = await workspaceStateStore.requireRecentWorkspacePath(folderPath);
    return openWorkspaceInCurrentWindow(event.sender, persistedPath);
  });

  ipcMain.handle("workspace:open-new-window", async (_event, folderPath) => {
    const persistedPath = await workspaceStateStore.requireRecentWorkspacePath(folderPath);
    return openWorkspaceInNewWindow(persistedPath);
  });

  ipcMain.handle("workspace:open-cloud-project-new-window", async (_event, request) => {
    const workspace = createCloudWorkspaceFromRequest(request);
    return openVirtualWorkspaceInNewWindow(workspace);
  });

  ipcMain.handle("workspace:select-folder", async (event) => {
    return selectWorkspaceForCurrentWindow(event.sender);
  });

  ipcMain.handle("workspace:select-folder-current", async (event) => {
    return selectWorkspaceForCurrentWindow(event.sender);
  });

  ipcMain.handle("workspace:select-folder-new-window", async (event) => {
    return selectWorkspaceForNewWindow(event.sender);
  });
}
