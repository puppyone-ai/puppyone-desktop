export function registerTerminalIpcHandlers({ ipcMain, terminalService, getWorkspaceRootForSender }) {
  ipcMain.handle("terminal:create", async (event, request) => {
    return terminalService.create(event.sender, request, getWorkspaceRootForSender?.(event.sender) ?? null);
  });

  ipcMain.on("terminal:input", (_event, request) => {
    terminalService.input(request);
  });

  ipcMain.on("terminal:resize", (_event, request) => {
    terminalService.resize(request);
  });

  ipcMain.handle("terminal:close", async (_event, id) => {
    terminalService.close(id);
  });
}
