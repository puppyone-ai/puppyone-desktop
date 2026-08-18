import type { AgentProviderInspection, AgentRuntimeCatalogEntry } from "./agent-contract";

/** Renderer-safe Agent backend catalog derived only from the shared inspection DTO. */
export function listAgentBackends(inspection: AgentProviderInspection | null): AgentRuntimeCatalogEntry[] {
  if (inspection?.runtimes?.length) return inspection.runtimes;
  if (!inspection?.runtime) return [];
  return [{ descriptor: inspection.runtime, readiness: inspection.readiness }];
}

/** Coding Agent products shown in the composer; the bundled first-party runtime stays internal here. */
export function listCodingAgentProviders(inspection: AgentProviderInspection | null): AgentRuntimeCatalogEntry[] {
  return listAgentBackends(inspection).filter((entry) => entry.descriptor.distribution !== "bundled");
}

export function listEnabledCodingAgentProviders(
  inspection: AgentProviderInspection | null,
  enabledRuntimeIds: readonly string[] | null,
): AgentRuntimeCatalogEntry[] {
  const enabled = enabledRuntimeIds ? new Set(enabledRuntimeIds) : null;
  return listCodingAgentProviders(inspection).filter((entry) => (
    entry.readiness.status !== "not-installed"
    && (!enabled || enabled.has(entry.descriptor.id))
  ));
}

export function isSelectableAgentBackend(entry: AgentRuntimeCatalogEntry) {
  return entry.readiness.status === "ready" && entry.readiness.selectable !== false;
}
