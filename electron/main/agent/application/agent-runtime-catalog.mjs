import { createRuntimeResolutionCoordinator } from "./runtime-resolution/runtime-resolution-coordinator.mjs";
import { runtimeReadinessStorePolicy } from "./runtime-resolution/runtime-readiness-store.mjs";

/** Renderer-safe catalog facade over the authoritative main-process resolver. */
export function createAgentRuntimeCatalog({
  runtimeResolutionCoordinator = null,
  runtimeRegistry,
  processSupervisor,
} = {}) {
  const coordinator = runtimeResolutionCoordinator ?? createRuntimeResolutionCoordinator({
    runtimeRegistry,
    processSupervisor,
  });
  return {
    discover: (request, workspaceRoot) => coordinator.queryCatalog(request, workspaceRoot),
    listModels: async (request, workspaceRoot) => (
      await coordinator.queryCatalog(request, workspaceRoot)
    ).models,
    readAccount: async (request, workspaceRoot) => (
      await coordinator.queryCatalog(request, workspaceRoot)
    ).account,
    clear: () => coordinator.clear(),
  };
}

export const agentRuntimeCatalogPolicy = Object.freeze({
  inspectionCacheTtlMs: runtimeReadinessStorePolicy.successTtlMs,
});
