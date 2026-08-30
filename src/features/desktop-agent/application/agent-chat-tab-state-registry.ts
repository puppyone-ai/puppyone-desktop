import type { AgentChatTabsState } from "../domain/agent-chat-tabs";

const MAX_WORKSPACES = 8;
const states = new Map<string, AgentChatTabsState>();

/** Keeps workspace tab topology alive across Sidebar and workspace remounts. */
export function readAgentChatTabsState(
  workspaceRoot: string,
  create: () => AgentChatTabsState,
) {
  const state = states.get(workspaceRoot) ?? create();
  states.delete(workspaceRoot);
  states.set(workspaceRoot, state);
  trim();
  return state;
}

export function writeAgentChatTabsState(workspaceRoot: string, state: AgentChatTabsState) {
  states.delete(workspaceRoot);
  states.set(workspaceRoot, state);
  trim();
}

function trim() {
  while (states.size > MAX_WORKSPACES) {
    const oldest = states.keys().next().value as string | undefined;
    if (!oldest) return;
    states.delete(oldest);
  }
}

export function clearAgentChatTabStateRegistryForTests() {
  states.clear();
}
