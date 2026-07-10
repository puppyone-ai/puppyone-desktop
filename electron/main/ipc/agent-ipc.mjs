export function registerAgentIpcHandlers({
  ipcMain,
  agentService,
  authorizeWorkspaceRoot,
}) {
  ipcMain.handle("agent:provider-discover", (event, request) => (
    agentService.discoverProvider(event.sender, request)
  ));

  ipcMain.handle("agent:session-create", async (event, request) => {
    const workspaceRoot = await authorizeWorkspaceRoot(event, request?.rootPath);
    return agentService.createSession(event.sender, request, workspaceRoot);
  });

  ipcMain.handle("agent:session-restore", async (event, request) => {
    const workspaceRoot = await authorizeWorkspaceRoot(event, request?.rootPath);
    return agentService.restoreSession(event.sender, request, workspaceRoot);
  });

  ipcMain.handle("agent:session-replay", (event, request) => (
    agentService.replay(event.sender, request)
  ));

  ipcMain.handle("agent:session-close", (event, request) => (
    agentService.closeSession(event.sender, request)
  ));

  ipcMain.handle("agent:turn-start", (event, request) => (
    agentService.startTurn(event.sender, request)
  ));

  ipcMain.handle("agent:turn-interrupt", (event, request) => (
    agentService.interruptTurn(event.sender, request)
  ));

  ipcMain.handle("agent:approval-resolve", (event, request) => (
    agentService.resolveApproval(event.sender, request)
  ));
}
