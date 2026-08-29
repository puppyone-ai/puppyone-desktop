export function registerGitAutoCommitIpcHandlers({
  ipcMain,
  authorizeWorkspaceRoot,
  gitAutoCommitService,
}) {
  ipcMain.handle("git-auto-commit:get-settings", async (event, request) => {
    const requestedRoot = typeof request?.rootPath === "string" && request.rootPath.trim()
      ? request.rootPath
      : null;
    const rootPath = requestedRoot
      ? await authorizeWorkspaceRoot(event, requestedRoot)
      : null;
    return gitAutoCommitService.getSnapshot(rootPath);
  });

  ipcMain.handle("git-auto-commit:set-experimental-opt-in", async (_event, request) => (
    gitAutoCommitService.setExperimentalOptIn(request?.enabled === true)
  ));

  ipcMain.handle("git-auto-commit:set-workspace-policy", async (event, request) => {
    const rootPath = await authorizeWorkspaceRoot(event, request?.rootPath);
    const patch = {};
    if (typeof request?.enabled === "boolean") patch.enabled = request.enabled;
    if (Number.isSafeInteger(request?.minimumIntervalMs)) {
      patch.minimumIntervalMs = request.minimumIntervalMs;
    }
    if (Object.keys(patch).length === 0) {
      throw new Error("A Git Auto Commit workspace policy change is required.");
    }
    return gitAutoCommitService.setWorkspacePolicy(rootPath, patch);
  });
}
