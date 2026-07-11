import { authorizeAgentReferences, createAgentReferenceBudget } from "../agent/agent-reference-authorization.mjs";

export function registerAgentIpcHandlers({
  ipcMain,
  agentService,
  authorizeWorkspaceRoot,
}) {
  ipcMain.handle("agent:providers-discover", async (event, request) => {
    const rootPath = typeof request?.rootPath === "string" ? request.rootPath : null;
    const workspaceRoot = rootPath ? await authorizeWorkspaceRoot(event, rootPath) : null;
    return agentService.discoverProviders(event.sender, request, workspaceRoot);
  });

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

  ipcMain.handle("agent:session-replay", async (event, request) => {
    const workspaceRoot = await authorizeWorkspaceRoot(event, request?.rootPath);
    return agentService.replay(event.sender, request, workspaceRoot);
  });

  ipcMain.handle("agent:sessions-list", async (event, request) => {
    const workspaceRoot = await authorizeWorkspaceRoot(event, request?.rootPath);
    return agentService.listSessions(event.sender, request, workspaceRoot);
  });

  ipcMain.handle("agent:session-fork", async (event, request) => {
    const workspaceRoot = await authorizeWorkspaceRoot(event, request?.rootPath);
    return agentService.forkSession(event.sender, request, workspaceRoot);
  });

  ipcMain.handle("agent:session-archive", async (event, request) => {
    const workspaceRoot = await authorizeWorkspaceRoot(event, request?.rootPath);
    return agentService.archiveSession(event.sender, request, workspaceRoot);
  });

  ipcMain.handle("agent:session-delete", async (event, request) => {
    const workspaceRoot = await authorizeWorkspaceRoot(event, request?.rootPath);
    return agentService.deleteSession(event.sender, request, workspaceRoot);
  });

  ipcMain.handle("agent:session-close", async (event, request) => {
    const workspaceRoot = await authorizeWorkspaceRoot(event, request?.rootPath);
    return agentService.closeSession(event.sender, request, workspaceRoot);
  });

  ipcMain.handle("agent:turn-start", async (event, request) => {
    const workspaceRoot = await authorizeWorkspaceRoot(event, request?.rootPath);
    // Attachments and @ context share one memory/count budget. Authorize them
    // sequentially so two 25 MB groups cannot be buffered at the same time.
    const referenceBudget = createAgentReferenceBudget();
    const attachments = await authorizeAgentReferences({
      workspaceRoot,
      references: request?.attachments,
      budget: referenceBudget,
    });
    const contextReferences = await authorizeAgentReferences({
      workspaceRoot,
      references: request?.contextReferences,
      budget: referenceBudget,
    });
    return agentService.startTurn(event.sender, { ...request, attachments, contextReferences }, workspaceRoot);
  });

  ipcMain.handle("agent:turn-steer", async (event, request) => {
    const workspaceRoot = await authorizeWorkspaceRoot(event, request?.rootPath);
    return agentService.steerTurn(event.sender, request, workspaceRoot);
  });

  ipcMain.handle("agent:turn-interrupt", async (event, request) => {
    const workspaceRoot = await authorizeWorkspaceRoot(event, request?.rootPath);
    return agentService.interruptTurn(event.sender, request, workspaceRoot);
  });

  ipcMain.handle("agent:session-compact", async (event, request) => {
    const workspaceRoot = await authorizeWorkspaceRoot(event, request?.rootPath);
    return agentService.compactSession(event.sender, request, workspaceRoot);
  });

  ipcMain.handle("agent:approval-resolve", async (event, request) => {
    const workspaceRoot = await authorizeWorkspaceRoot(event, request?.rootPath);
    return agentService.resolveApproval(event.sender, request, workspaceRoot);
  });

  ipcMain.handle("agent:question-resolve", async (event, request) => {
    const workspaceRoot = await authorizeWorkspaceRoot(event, request?.rootPath);
    return agentService.resolveQuestion(event.sender, request, workspaceRoot);
  });
}
