import { createOpenCodeDiscovery } from "./opencode-discovery.mjs";
import { OpenCodeSidecarAdapter } from "./opencode-sidecar-adapter.mjs";
import { OpenCodeSidecarHost } from "./opencode-sidecar-host.mjs";
import { OPENCODE_RUNTIME_DESCRIPTOR } from "./opencode-manifest.mjs";

export function createOpenCodeRuntimeDefinition({
  appPath = null,
  resourcesPath = process.resourcesPath,
  managedConfigDir = null,
  allowExternal = false,
  logger = console,
  discovery = createOpenCodeDiscovery({ appPath, resourcesPath, managedConfigDir, allowExternal }),
  host = new OpenCodeSidecarHost({ logger }),
} = {}) {
  return {
    descriptor: OPENCODE_RUNTIME_DESCRIPTOR,
    discovery,
    createAdapter: ({ readiness, ...options }) => new OpenCodeSidecarAdapter({
      ...options,
      readiness,
      host,
    }),
    hasActiveResources: () => host.snapshot().state !== "idle",
    dispose: () => host.stop(),
  };
}
