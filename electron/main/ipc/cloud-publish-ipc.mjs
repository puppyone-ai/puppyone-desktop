const UNKNOWN_ERROR = Object.freeze({
  code: "UNKNOWN",
  retryable: false,
  message: "Unable to authorize the local workspace for Cloud publishing.",
});

/** Structured IPC boundary: publish failures never depend on Electron messages. */
export function registerCloudPublishIpcHandlers({
  ipcMain,
  authorizeWorkspaceRoot,
  cloudPublishCoordinator,
  cloudGitConnectCoordinator = null,
}) {
  if (!cloudPublishCoordinator) throw new TypeError("cloudPublishCoordinator is required.");

  const withAuthorizedRoot = (operation) => async (event, request) => {
    try {
      const rootPath = await authorizeWorkspaceRoot(event, request?.rootPath);
      return await operation({ ...request, rootPath }, event);
    } catch (error) {
      return {
        ok: false,
        state: null,
        error: {
          ...UNKNOWN_ERROR,
          message: sanitizeMessage(error),
        },
      };
    }
  };
  const withAuthorizedConnectRoot = (operation) => async (event, request) => {
    try {
      const rootPath = await authorizeWorkspaceRoot(event, request?.rootPath);
      return await operation({ ...request, rootPath });
    } catch (error) {
      return {
        ok: false,
        operationId: null,
        state: null,
        error: {
          ...UNKNOWN_ERROR,
          message: sanitizeMessage(error),
        },
      };
    }
  };

  ipcMain.handle("cloud-publish:get-state", withAuthorizedRoot((request) => (
    cloudPublishCoordinator.getState(request)
  )));
  ipcMain.handle("cloud-publish:start-or-resume", withAuthorizedRoot((request, event) => (
    cloudPublishCoordinator.startOrResume(request, {
      onProgress: (progress) => {
        if (event.sender.isDestroyed?.()) return;
        event.sender.send("cloud-publish:progress", progress);
      },
    })
  )));
  ipcMain.handle("cloud-publish:abandon", withAuthorizedRoot((request) => (
    cloudPublishCoordinator.abandon(request)
  )));
  if (cloudGitConnectCoordinator) {
    ipcMain.handle("cloud-git:connect-project", withAuthorizedConnectRoot((request) => (
      cloudGitConnectCoordinator.connect(request)
    )));
    ipcMain.handle("cloud-git:abandon-connect", withAuthorizedConnectRoot((request) => (
      cloudGitConnectCoordinator.abandon(request)
    )));
  }
}

function sanitizeMessage(error) {
  return (error instanceof Error ? error.message : String(error ?? UNKNOWN_ERROR.message))
    .replace(/pwg_[A-Za-z0-9_-]+/g, "[redacted]")
    .slice(0, 500);
}
