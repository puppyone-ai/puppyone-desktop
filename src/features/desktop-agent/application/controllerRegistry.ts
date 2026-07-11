import { AgentSessionController } from "./AgentSessionController";
import type { AgentClientProvider } from "./AgentClientPort";

const MAX_CONTROLLERS = 8;
const controllers = new Map<string, AgentSessionController>();

/**
 * Workspace-scoped controllers deliberately outlive the React Sidebar. Hiding
 * or remounting presentation must never stop a main-process Agent turn.
 */
export function getAgentSessionController(workspaceRoot: string, clientProvider: AgentClientProvider) {
  let controller = controllers.get(workspaceRoot);
  if (!controller) {
    controller = new AgentSessionController(workspaceRoot, clientProvider);
  } else {
    controllers.delete(workspaceRoot);
  }
  controllers.set(workspaceRoot, controller);
  trimInactiveControllers(workspaceRoot);
  return controller;
}

function trimInactiveControllers(currentWorkspaceRoot: string) {
  while (controllers.size > MAX_CONTROLLERS) {
    const candidate = Array.from(controllers.entries()).find(([workspaceRoot, controller]) => (
      workspaceRoot !== currentWorkspaceRoot && !controller.hasSubscribers()
    ));
    if (!candidate) return;
    candidate[1].dispose();
    controllers.delete(candidate[0]);
  }
}

export function clearAgentControllerRegistryForTests() {
  for (const controller of controllers.values()) controller.dispose();
  controllers.clear();
}
