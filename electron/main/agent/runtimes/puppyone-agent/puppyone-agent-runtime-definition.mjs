import { createOpenCodeDiscovery } from "./managed-opencode-discovery.mjs";
import { OpenCodeAcpAdapter } from "../opencode-protocol/opencode-acp-adapter.mjs";
import { PUPPYONE_AGENT_RUNTIME_DESCRIPTOR } from "./puppyone-agent-identity.mjs";

export function createPuppyOneAgentRuntimeDefinition({
  appPath = null,
  resourcesPath = process.resourcesPath,
  managedConfigDir = null,
  allowExternal = false,
  logger = console,
  appVersion = "0.0.0",
  discovery = createOpenCodeDiscovery({ appPath, resourcesPath, managedConfigDir, allowExternal }),
  adapterFactory = (options) => new OpenCodeAcpAdapter(options),
} = {}) {
  const adapters = new Set();
  return {
    descriptor: PUPPYONE_AGENT_RUNTIME_DESCRIPTOR,
    discovery,
    createAdapter: ({ readiness, ...options }) => {
      let adapter;
      adapter = adapterFactory({
        ...options,
        readiness,
        appVersion,
        logger,
        runtimeDescriptor: PUPPYONE_AGENT_RUNTIME_DESCRIPTOR,
        managed: true,
        onDispose: () => adapters.delete(adapter),
      });
      adapters.add(adapter);
      return adapter;
    },
    hasActiveResources: () => Array.from(adapters).some((adapter) => adapter.hasActiveProcess?.() === true),
    dispose: async () => {
      const active = Array.from(adapters);
      adapters.clear();
      await Promise.allSettled(active.map((adapter) => adapter.dispose?.()));
    },
  };
}
