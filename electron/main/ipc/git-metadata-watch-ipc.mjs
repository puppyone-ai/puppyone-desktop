// Authorized IPC surface for the Git metadata watcher.
//
// Bridge contract (see docs/architecture/git/status-refresh-lifecycle.md WP2):
//   startGitRepositoryWatch({ rootPath }) -> { subscriptionId, rootPath, repository }
//   gitRepositoryInvalidated               -> { subscriptionId, rootPath, reason }
//   stopGitRepositoryWatch({ subscriptionId }) -> { ok: true }
//
// The renderer never supplies a Git metadata path: it authorizes the workspace
// root, and the service resolves repository-owned paths through Git.

export function registerGitMetadataWatchIpcHandlers({
  ipcMain,
  gitMetadataWatchService,
  authorizeWorkspaceRoot,
}) {
  ipcMain.handle("git-repository:watch-start", async (event, request) => {
    const rootPath = await authorizeWorkspaceRoot(event, request?.rootPath);
    return gitMetadataWatchService.start(event.sender, rootPath);
  });

  ipcMain.handle("git-repository:watch-stop", async (event, request) => {
    const subscriptionId = request?.subscriptionId;
    if (typeof subscriptionId === "string" && subscriptionId.length > 0) {
      gitMetadataWatchService.stop(subscriptionId, event.sender.id);
    }
    return { ok: true };
  });
}
