import type { AgentLocalConnectionsSnapshot } from "../../../../../shared/agent-contract/types";

export function discoverLocalTerminalAgents(
  workspacePath: string,
  refresh: boolean,
): Promise<AgentLocalConnectionsSnapshot> {
  const discover = window.puppyoneDesktop?.discoverLocalAgentConnections;
  if (!discover) return Promise.reject(new Error("Local Agent inventory is unavailable."));
  return discover({ rootPath: workspacePath, refresh });
}
