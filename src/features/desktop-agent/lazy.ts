export { isDesktopAgentChatEnabled } from "./featureGate";

/** Public lazy entrypoint for the experimental Agent Chat renderer. */
export function loadRightAgentPanel() {
  return import("./ui/RightAgentPanel").then(({ RightAgentPanel }) => ({ default: RightAgentPanel }));
}

let workbenchItemModule: ReturnType<typeof importAgentChatWorkbenchItem> | null = null;

export function loadAgentChatWorkbenchItem() {
  return getAgentChatWorkbenchItemModule().then((module) => ({
    default: module.AgentChatWorkbenchItem,
  }));
}

export async function prepareAgentChatWorkbenchItem() {
  await getAgentChatWorkbenchItemModule();
}

export async function closeAgentChatWorkbenchItem(rootId: string, itemId: string) {
  const module = await getAgentChatWorkbenchItemModule();
  return module.requestCloseAgentChatWorkbenchItem(rootId, itemId);
}

function getAgentChatWorkbenchItemModule() {
  if (!workbenchItemModule) {
    const pendingModule = importAgentChatWorkbenchItem();
    workbenchItemModule = pendingModule.catch((error: unknown) => {
      // A stale renderer chunk or transient read failure must not poison every
      // later Chat creation attempt for the lifetime of the window.
      workbenchItemModule = null;
      throw error;
    });
  }
  return workbenchItemModule;
}

function importAgentChatWorkbenchItem() {
  return import("./workbench/AgentChatWorkbenchItem");
}
