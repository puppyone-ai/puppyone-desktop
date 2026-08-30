import { AgentSessionController } from "./AgentSessionController";
import type { AgentClientProvider } from "./AgentClientPort";
import { clearAgentChatTabStateRegistryForTests } from "./agent-chat-tab-state-registry";

const MAX_CONTROLLERS = 8;
const controllers = new Map<string, AgentSessionController>();

/**
 * Workspace-and-tab-scoped controllers deliberately outlive presentation
 * switches. Hiding the Sidebar or another tab must never stop an Agent turn.
 */
export function getAgentSessionController(
  workspaceRoot: string,
  clientProvider: AgentClientProvider,
  tabId = "default",
) {
  const controllerKey = key(workspaceRoot, tabId);
  let controller = controllers.get(controllerKey);
  if (!controller) {
    controller = new AgentSessionController(workspaceRoot, clientProvider);
  } else {
    controllers.delete(controllerKey);
  }
  controllers.set(controllerKey, controller);
  trimInactiveControllers(controllerKey);
  return controller;
}

export async function closeAgentSessionController(workspaceRoot: string, tabId: string) {
  const controllerKey = key(workspaceRoot, tabId);
  const controller = controllers.get(controllerKey);
  if (!controller) return true;
  const closed = await controller.closeTabSession();
  if (!closed) return false;
  controller.dispose();
  controllers.delete(controllerKey);
  return true;
}

/** Disposes a controller whose reserved Workbench Item was never committed. */
export function discardAgentSessionController(workspaceRoot: string, tabId: string) {
  const controllerKey = key(workspaceRoot, tabId);
  const controller = controllers.get(controllerKey);
  if (!controller) return;
  controller.dispose();
  controllers.delete(controllerKey);
}

function trimInactiveControllers(currentControllerKey: string) {
  while (controllers.size > MAX_CONTROLLERS) {
    const candidate = Array.from(controllers.entries()).find(([controllerKey, controller]) => (
      controllerKey !== currentControllerKey && !controller.hasSubscribers()
    ));
    if (!candidate) return;
    candidate[1].dispose();
    controllers.delete(candidate[0]);
  }
}

function key(workspaceRoot: string, tabId: string) {
  return `${workspaceRoot}\u0000${tabId}`;
}

export function clearAgentControllerRegistryForTests() {
  for (const controller of controllers.values()) controller.dispose();
  controllers.clear();
  clearAgentChatTabStateRegistryForTests();
}
