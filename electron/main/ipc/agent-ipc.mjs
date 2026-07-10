export function registerAgentIpcHandlers({
  ipcMain,
  agentService,
  authorizeWorkspaceRoot,
}) {
  ipcMain.handle("agent:providers-discover", (event, request) => (
    agentService.discoverProviders(event.sender, request)
  ));

  ipcMain.handle("agent:models-list", async (event, request) => {
    const rootPath = typeof request?.rootPath === "string" ? request.rootPath : null;
    const workspaceRoot = rootPath ? await authorizeWorkspaceRoot(event, rootPath) : null;
    return agentService.listModels(event.sender, request, workspaceRoot);
  });

  ipcMain.handle("agent:account-read", async (event, request) => {
    const rootPath = typeof request?.rootPath === "string" ? request.rootPath : null;
    const workspaceRoot = rootPath ? await authorizeWorkspaceRoot(event, rootPath) : null;
    return agentService.readAccount(event.sender, request, workspaceRoot);
  });

  ipcMain.handle("agent:session-create", async (event, request) => {
    const workspaceRoot = await authorizeWorkspaceRoot(event, request?.rootPath);
    return agentService.createSession(event.sender, request, workspaceRoot);
  });

  ipcMain.handle("agent:session-resume", async (event, request) => {
    const workspaceRoot = await authorizeWorkspaceRoot(event, request?.rootPath);
    return agentService.resumeSession(event.sender, request, workspaceRoot);
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

  ipcMain.handle("agent:turn-steer", (event, request) => (
    agentService.steerTurn(event.sender, request)
  ));

  ipcMain.handle("agent:turn-interrupt", (event, request) => (
    agentService.interruptTurn(event.sender, request)
  ));

  ipcMain.handle("agent:approval-resolve", (event, request) => (
    agentService.resolveApproval(event.sender, request)
  ));

  ipcMain.handle("agent:question-resolve", (event, request) => (
    agentService.resolveQuestion(event.sender, request)
  ));
}
