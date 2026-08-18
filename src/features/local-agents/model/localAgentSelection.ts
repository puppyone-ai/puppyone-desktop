import type { AgentLocalConnection } from "../../../../shared/agent-contract/types";
import type { LocalAgentsSettings } from "../../../preferences";

const RUNTIME_ID_BY_LOCAL_AGENT_ID: Readonly<Record<string, string>> = {
  opencode: "opencode-native",
};

export function installedLocalAgents(connections: readonly AgentLocalConnection[]) {
  return connections.filter((connection) => connection.installation !== "not-found");
}

export function setLocalAgentEnabled(
  settings: LocalAgentsSettings,
  agentId: string,
  enabled: boolean,
): LocalAgentsSettings {
  const current = new Set(settings.enabledAgentIds);
  if (enabled) current.add(agentId);
  else current.delete(agentId);
  return { enabledAgentIds: Array.from(current).sort((left, right) => left.localeCompare(right)) };
}

export function isLocalAgentEnabled(settings: LocalAgentsSettings, agentId: string) {
  return settings.enabledAgentIds.includes(agentId);
}

export function enabledLocalAgentRuntimeIds(settings: LocalAgentsSettings) {
  return settings.enabledAgentIds.map((agentId) => RUNTIME_ID_BY_LOCAL_AGENT_ID[agentId] ?? agentId);
}

export function isLocalAgentRuntimeEnabled(settings: LocalAgentsSettings, runtimeId: string) {
  return enabledLocalAgentRuntimeIds(settings).includes(runtimeId);
}
