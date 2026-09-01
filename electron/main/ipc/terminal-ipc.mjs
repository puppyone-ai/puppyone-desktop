export function registerTerminalIpcHandlers({
  ipcMain,
  terminalAgentLocator,
  terminalService,
  authorizeWorkspaceRoot,
}) {
  ipcMain.handle("terminal:agents-locate", async (event, request) => {
    const requestId = normalizeRequestId(request?.requestId);
    return terminalAgentLocator.locate({
      refresh: request?.refresh === true,
      onProgress: requestId
        ? (progress) => sendAgentLocationProgress(event.sender, requestId, progress)
        : null,
    });
  });

  ipcMain.handle("terminal:create", async (event, request) => {
    const workspaceRoot = await authorizeWorkspaceRoot(event, request?.rootPath);
    return terminalService.create(event.sender, request, workspaceRoot);
  });

  ipcMain.on("terminal:input", (event, request) => {
    terminalService.input(event.sender, request);
  });

  ipcMain.on("terminal:resize", (event, request) => {
    terminalService.resize(event.sender, request);
  });

  ipcMain.on("terminal:appearance", (event, request) => {
    terminalService.appearance(event.sender, request);
  });

  ipcMain.handle("terminal:close", async (event, id) => {
    terminalService.close(event.sender, id);
  });
}

function normalizeRequestId(value) {
  return typeof value === "string" && /^[A-Za-z0-9:_-]{1,96}$/u.test(value)
    ? value
    : null;
}

function sendAgentLocationProgress(sender, requestId, progress) {
  try {
    if (typeof sender?.isDestroyed === "function" && sender.isDestroyed()) return;
    sender?.send?.("terminal:agents-progress", { requestId, ...progress });
  } catch {
    // The requesting window may close while the shared scan is in flight.
  }
}
