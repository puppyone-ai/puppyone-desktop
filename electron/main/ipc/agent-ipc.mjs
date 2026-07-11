import { authorizeAgentReferences, createAgentReferenceBudget } from "../agent/agent-reference-authorization.mjs";
import { assertAgentIpcResponse, parseAgentIpcRequest } from "../../../shared/agent-contract/schema.mjs";

export function registerAgentIpcHandlers({
  ipcMain,
  agentService,
  localAgentInventory,
  authorizeWorkspaceRoot,
}) {
  const register = (channel, handler) => {
    ipcMain.handle(channel, async (event, rawRequest) => {
      const request = parseAgentIpcRequest(channel, rawRequest);
      const response = await handler(event, request);
      return assertAgentIpcResponse(channel, response);
    });
  };

  const authorizeOptionalRoot = async (event, request) => (
    request.rootPath ? authorizeWorkspaceRoot(event, request.rootPath) : null
  );
  const authorizeRequiredRoot = (event, request) => authorizeWorkspaceRoot(event, request.rootPath);

  register("agent:providers-discover", async (event, request) => (
    agentService.discoverProviders(event.sender, request, await authorizeOptionalRoot(event, request))
  ));
  register("agent:local-connections-discover", async (event, request) => (
    localAgentInventory.discover({
      refresh: request.refresh === true,
      workspaceRoot: await authorizeOptionalRoot(event, request),
    })
  ));
  register("agent:models-list", async (event, request) => (
    agentService.listModels(event.sender, request, await authorizeOptionalRoot(event, request))
  ));
  register("agent:account-read", async (event, request) => (
    agentService.readAccount(event.sender, request, await authorizeOptionalRoot(event, request))
  ));
  register("agent:session-create", async (event, request) => (
    agentService.createSession(event.sender, request, await authorizeRequiredRoot(event, request))
  ));
  register("agent:session-resume", async (event, request) => (
    agentService.resumeSession(event.sender, request, await authorizeRequiredRoot(event, request))
  ));
  register("agent:session-replay", async (event, request) => (
    agentService.replay(event.sender, request, await authorizeRequiredRoot(event, request))
  ));
  register("agent:sessions-list", async (event, request) => (
    agentService.listSessions(event.sender, request, await authorizeRequiredRoot(event, request))
  ));
  register("agent:session-fork", async (event, request) => (
    agentService.forkSession(event.sender, request, await authorizeRequiredRoot(event, request))
  ));
  register("agent:session-archive", async (event, request) => (
    agentService.archiveSession(event.sender, request, await authorizeRequiredRoot(event, request))
  ));
  register("agent:session-delete", async (event, request) => (
    agentService.deleteSession(event.sender, request, await authorizeRequiredRoot(event, request))
  ));
  register("agent:session-close", async (event, request) => (
    agentService.closeSession(event.sender, request, await authorizeRequiredRoot(event, request))
  ));
  register("agent:turn-steer", async (event, request) => (
    agentService.steerTurn(event.sender, request, await authorizeRequiredRoot(event, request))
  ));
  register("agent:turn-interrupt", async (event, request) => (
    agentService.interruptTurn(event.sender, request, await authorizeRequiredRoot(event, request))
  ));
  register("agent:session-compact", async (event, request) => (
    agentService.compactSession(event.sender, request, await authorizeRequiredRoot(event, request))
  ));
  register("agent:approval-resolve", async (event, request) => (
    agentService.resolveApproval(event.sender, request, await authorizeRequiredRoot(event, request))
  ));
  register("agent:question-resolve", async (event, request) => (
    agentService.resolveQuestion(event.sender, request, await authorizeRequiredRoot(event, request))
  ));

  register("agent:turn-start", async (event, request) => {
    const workspaceRoot = await authorizeRequiredRoot(event, request);
    // Attachments and @ context share one memory/count budget. Authorize them
    // sequentially so two 25 MB groups cannot be buffered at the same time.
    const referenceBudget = createAgentReferenceBudget();
    const attachments = await authorizeAgentReferences({
      workspaceRoot,
      references: request.attachments,
      budget: referenceBudget,
    });
    const contextReferences = await authorizeAgentReferences({
      workspaceRoot,
      references: request.contextReferences,
      budget: referenceBudget,
    });
    return agentService.startTurn(event.sender, { ...request, attachments, contextReferences }, workspaceRoot);
  });
}
