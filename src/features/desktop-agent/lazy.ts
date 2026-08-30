import type { AuxiliaryWorkbenchPreparationContext } from "../app-shell/auxiliary-workbench/types";
export { isDesktopAgentChatEnabled } from "./featureGate";

/** Public lazy entrypoint for the experimental Agent Chat renderer. */
export function loadRightAgentPanel() {
  return import("./ui/RightAgentPanel").then(({ RightAgentPanel }) => ({ default: RightAgentPanel }));
}

let workbenchItemModule: ReturnType<typeof importAgentChatWorkbenchItem> | null = null;
let resolvedWorkbenchItemModule: Awaited<ReturnType<typeof importAgentChatWorkbenchItem>> | null = null;

export function loadAgentChatWorkbenchItem() {
  return getAgentChatWorkbenchItemModule().then((module) => ({
    default: module.AgentChatWorkbenchItem,
  }));
}

export async function prepareAgentChatWorkbenchItem(context: AuxiliaryWorkbenchPreparationContext) {
  const module = await getAgentChatWorkbenchItemModule();
  await module.prepareAgentChatWorkbenchItem(
    context.item.rootId,
    context.item.id,
    context.recipe?.id ?? null,
  );
}

export async function discardPreparedAgentChatWorkbenchItem(
  context: AuxiliaryWorkbenchPreparationContext,
) {
  resolvedWorkbenchItemModule?.discardPreparedAgentChatWorkbenchItem(
    context.item.rootId,
    context.item.id,
  );
}

export async function closeAgentChatWorkbenchItem(rootId: string, itemId: string) {
  const module = await getAgentChatWorkbenchItemModule();
  return module.requestCloseAgentChatWorkbenchItem(rootId, itemId);
}

function getAgentChatWorkbenchItemModule() {
  if (!workbenchItemModule) {
    const pendingModule = importAgentChatWorkbenchItem();
    workbenchItemModule = pendingModule
      .then((module) => {
        resolvedWorkbenchItemModule = module;
        return module;
      })
      .catch((error: unknown) => {
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
