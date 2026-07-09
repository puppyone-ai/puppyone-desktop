export function registerTerminalIpcHandlers({
  ipcMain,
  terminalService,
  authorizeWorkspaceRoot,
}) {
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

  ipcMain.handle("terminal:close", async (event, id) => {
    terminalService.close(event.sender, id);
  });
}
