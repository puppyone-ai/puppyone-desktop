import type { AgentDraftReference, AgentRuntimeInspection } from "../domain/agent-contract";

export function chooseAgentMode(inspection: AgentRuntimeInspection | null, current: string | null) {
  const modes = inspection?.modes ?? [];
  if (current && modes.some((mode) => mode.id === current)) return current;
  return modes.find((mode) => mode.isDefault)?.id || modes[0]?.id || null;
}

export function mergeAgentReferences(current: AgentDraftReference[], incoming: AgentDraftReference[]) {
  const byIdentity = new Map(current.map((entry) => [entry.id, entry]));
  for (const entry of incoming) if (entry?.id) byIdentity.set(entry.id, entry);
  // Keep bounded error rows visible instead of silently dropping an over-limit
  // item before the user can understand or remove it.
  return Array.from(byIdentity.values()).slice(0, 64);
}
