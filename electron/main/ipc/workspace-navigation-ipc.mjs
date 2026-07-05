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
  workspaceFromPath,
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

  ipcMain.handle("workspace:remember-last", async (_event, folderPath) => {
    if (typeof folderPath !== "string" || folderPath.trim().length === 0) {
      throw new Error("Folder path is required.");
    }
    await workspaceStateStore.rememberRecentWorkspacePath(folderPath);
    return { ok: true };
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
    if (typeof folderPath !== "string" || folderPath.trim().length === 0) {
      throw new Error("Folder path is required.");
    }
    return openWorkspaceInCurrentWindow(event.sender, folderPath);
  });

  ipcMain.handle("workspace:open-new-window", async (_event, folderPath) => {
    if (typeof folderPath !== "string" || folderPath.trim().length === 0) {
      throw new Error("Folder path is required.");
    }
    return openWorkspaceInNewWindow(folderPath);
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

  ipcMain.handle("workspace:from-path", async (_event, folderPath) => {
    if (typeof folderPath !== "string" || folderPath.trim().length === 0) {
      throw new Error("Folder path is required.");
    }
    return workspaceFromPath(folderPath);
  });
}
