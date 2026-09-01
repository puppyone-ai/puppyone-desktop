import { createPiDiscovery } from "./pi-discovery.mjs";
import { PiRpcAdapter } from "./pi-rpc-adapter.mjs";
import { PI_RUNTIME_DESCRIPTOR, PI_RUNTIME_MANIFEST } from "./pi-identity.mjs";

export { PI_RUNTIME_DESCRIPTOR, PI_RUNTIME_MANIFEST } from "./pi-identity.mjs";

export function createPiRuntimeDefinition({
  discovery = createPiDiscovery(),
  logger = console,
  adapterFactory = (options) => new PiRpcAdapter(options),
} = {}) {
  const adapters = new Set();
  return {
    manifest: PI_RUNTIME_MANIFEST,
    discovery,
    createAdapter: ({ readiness, ...options }) => {
      let adapter;
      adapter = adapterFactory({
        ...options,
        readiness,
        logger,
        runtimeDescriptor: PI_RUNTIME_DESCRIPTOR,
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
