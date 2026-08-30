import { createCursorDiscovery } from "./cursor-discovery.mjs";
import { CursorAcpAdapter } from "./cursor-acp-adapter.mjs";
import { CURSOR_RUNTIME_DESCRIPTOR, CURSOR_RUNTIME_MANIFEST } from "./cursor-identity.mjs";

export { CURSOR_RUNTIME_DESCRIPTOR, CURSOR_RUNTIME_MANIFEST } from "./cursor-identity.mjs";

export function createCursorRuntimeDefinition({
  discovery = createCursorDiscovery(),
  logger = console,
  appVersion = "0.0.0",
  adapterFactory = (options) => new CursorAcpAdapter(options),
} = {}) {
  const adapters = new Set();
  return {
    manifest: CURSOR_RUNTIME_MANIFEST,
    discovery,
    createAdapter: ({ readiness, ...options }) => {
      let adapter;
      adapter = adapterFactory({
        ...options,
        readiness,
        appVersion,
        logger,
        runtimeDescriptor: CURSOR_RUNTIME_DESCRIPTOR,
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
