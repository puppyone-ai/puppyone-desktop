/**
 * Builds the post-commit lifecycle boundary for a detached Workspace root.
 *
 * Persistence and WindowWorkspaceState publication already completed before
 * this callback runs. Cleanup is therefore best-effort: an optional subsystem
 * must never turn a committed detach into a rejected renderer request.
 */
export function createDetachedWorkspaceCleanup({
  agentService,
  getAppPreviewRuntime,
  getWindowState,
  gitAutoCommitHost,
  gitMetadataWatchService,
  localFileCapabilities,
  logger = console,
  resolveWindowTitle,
  terminalService,
  workspaceWatchService,
}) {
  return async function cleanupDetachedWorkspace(window, folder) {
    const webContentsId = window.webContents.id;
    const rootPath = folder.path;
    await Promise.all([
      settleCleanup(
        "Unable to revoke local file capabilities for a removed Project:",
        () => localFileCapabilities.revokeWorkspaceRoot(webContentsId, rootPath),
        logger,
      ),
      settleCleanup(
        "Unable to stop file watching for a removed Project:",
        () => workspaceWatchService.stopForWorkspaceRoot(webContentsId, rootPath),
        logger,
      ),
      settleCleanup(
        "Unable to stop Git metadata watching for a removed Project:",
        () => gitMetadataWatchService.stopForWorkspaceRoot(webContentsId, rootPath),
        logger,
      ),
      settleCleanup(
        "Unable to close terminals for a removed Project:",
        () => terminalService.closeSessionsForWorkspaceRoot(webContentsId, rootPath),
        logger,
      ),
      settleCleanup(
        "Unable to close App Preview sessions for a removed Project:",
        () => getAppPreviewRuntime()?.closeSessionsForWorkspaceRoot(webContentsId, rootPath),
        logger,
      ),
      settleCleanup(
        "Unable to close Agent sessions for a removed Project:",
        () => agentService.closeSessionsForWorkspaceRoot(webContentsId, rootPath),
        logger,
      ),
    ]);

    let primaryPath = null;
    try {
      primaryPath = getWindowState(window).folderPaths[0] ?? null;
    } catch (error) {
      logger.warn("Unable to read Workspace state after removing a Project:", error);
    }

    if (primaryPath) {
      await settleCleanup(
        "Unable to reassign Git Auto Commit after removing a Project:",
        () => gitAutoCommitHost.assignWorkspace(window.webContents, primaryPath),
        logger,
      );
    }

    await settleCleanup(
      "Unable to update the window title after removing a Project:",
      () => window.setTitle(window.isFullScreen() ? "" : resolveWindowTitle(window)),
      logger,
    );
    if (primaryPath && typeof window.setRepresentedFilename === "function") {
      await settleCleanup(
        "Unable to update the represented filename after removing a Project:",
        () => window.setRepresentedFilename(primaryPath),
        logger,
      );
    }
  };
}

async function settleCleanup(message, action, logger) {
  try {
    await action();
  } catch (error) {
    logger.warn(message, error);
  }
}
