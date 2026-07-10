/**
 * Optional catalog transport — disabled by default.
 * File selection never calls the catalog. Opening a file must never network.
 */

import { createDisabledCatalogTransport, CatalogDisabledError } from "./catalog-transport.mjs";

export { createDisabledCatalogTransport, CatalogDisabledError } from "./catalog-transport.mjs";

export function createViewerPackCatalogService({
  transport = createDisabledCatalogTransport(),
  now = () => new Date().toISOString(),
} = {}) {
  let state = {
    status: transport.enabled ? "idle" : "disabled",
  };

  return {
    getState() {
      return state;
    },

    async refresh(signal) {
      if (signal?.aborted) {
        state = { status: "error", error: "aborted" };
        return state;
      }
      if (!transport.enabled) {
        state = { status: "disabled" };
        return state;
      }
      try {
        await transport.fetchIndex({ signal });
        // Remote catalog verification is Stage C. Until a verified transport is
        // injected, remain fail-closed rather than trusting remote bytes.
        state = {
          status: "error",
          error: "catalog-transport-not-verified",
          refreshedAt: now(),
        };
        return state;
      } catch (error) {
        if (error instanceof CatalogDisabledError) {
          state = { status: "disabled" };
          return state;
        }
        state = {
          status: "error",
          error: error instanceof Error ? error.message : String(error),
          refreshedAt: now(),
        };
        return state;
      }
    },

    findCachedCandidates() {
      // No verified snapshot exists while disabled.
      return [];
    },
  };
}
