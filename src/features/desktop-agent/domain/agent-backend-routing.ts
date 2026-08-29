import type { AgentRuntimeCatalogEntry, AgentRuntimeInspection } from "./agent-contract";

/** Renderer-safe Agent backend catalog derived only from the shared inspection DTO. */
export function listAgentRuntimes(inspection: AgentRuntimeInspection | null): AgentRuntimeCatalogEntry[] {
  if (inspection?.runtimes?.length) return inspection.runtimes;
  if (!inspection?.runtime || !inspection.readiness) return [];
  return [{ descriptor: inspection.runtime, readiness: inspection.readiness }];
}

export function listEnabledAgentRuntimes(
  inspection: AgentRuntimeInspection | null,
  enabledRuntimeIds: readonly string[] | null,
): AgentRuntimeCatalogEntry[] {
  const enabled = enabledRuntimeIds ? new Set(enabledRuntimeIds) : null;
  return listAgentRuntimes(inspection).filter((entry) => (
    entry.readiness.status !== "not-installed"
    && (!enabled || enabled.has(entry.descriptor.id))
  ));
}

export function isSelectableAgentBackend(entry: AgentRuntimeCatalogEntry) {
  return entry.readiness.status === "ready" && entry.readiness.selectable !== false;
}
