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
    } catch {
      return {
        ok: false,
        state: null,
        error: {
          ...UNKNOWN_ERROR,
        },
      };
    }
  };
  const withAuthorizedConnectRoot = (operation) => async (event, request) => {
    try {
      const rootPath = await authorizeWorkspaceRoot(event, request?.rootPath);
      return await operation({ ...request, rootPath });
    } catch {
      return {
        ok: false,
        operationId: null,
        state: null,
        error: {
          ...UNKNOWN_ERROR,
        },
      };
    }
  };

  ipcMain.handle("cloud-initialization:get-state", withAuthorizedRoot((request) => (
    cloudPublishCoordinator.getState(request)
  )));
  ipcMain.handle("cloud-initialization:start", withAuthorizedRoot((request, event) => (
    cloudPublishCoordinator.startOrResume(request, {
      onProgress: (progress) => {
        if (event.sender.isDestroyed?.()) return;
        event.sender.send("cloud-initialization:progress", progress);
      },
    })
  )));
  ipcMain.handle("cloud-initialization:cleanup", withAuthorizedRoot((request) => (
    cloudPublishCoordinator.cleanup(request)
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
