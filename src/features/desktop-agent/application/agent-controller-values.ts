import type { AgentFileReference, AgentProviderInspection } from "../domain/agent-contract";

export function chooseAgentMode(inspection: AgentProviderInspection | null, current: string | null) {
  const modes = inspection?.modes ?? [];
  if (current && modes.some((mode) => mode.id === current)) return current;
  return modes.find((mode) => mode.isDefault)?.id || modes[0]?.id || null;
}

export function mergeAgentReferences(current: AgentFileReference[], incoming: AgentFileReference[]) {
  const byPath = new Map(current.map((entry) => [entry.path, entry]));
  for (const entry of incoming) if (entry?.path) byPath.set(entry.path, entry);
  return Array.from(byPath.values()).slice(0, 32);
}
