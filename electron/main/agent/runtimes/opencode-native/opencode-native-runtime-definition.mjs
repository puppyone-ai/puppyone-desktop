import { OpenCodeAcpAdapter } from "../opencode-protocol/opencode-acp-adapter.mjs";
import { createUserOpenCodeDiscovery } from "./opencode-native-discovery.mjs";

export const OPENCODE_NATIVE_RUNTIME_DESCRIPTOR = Object.freeze({
  id: "opencode-native",
  displayName: "OpenCode",
  description: "The user's OpenCode installation, profile, providers and native sessions.",
  kind: "native-cli",
  iconKey: "opencode",
  priority: 30,
  distribution: "user-installed",
});

export function createOpenCodeNativeRuntimeDefinition({
  discovery = createUserOpenCodeDiscovery(),
  logger = console,
  appVersion = "0.0.0",
  adapterFactory = (options) => new OpenCodeAcpAdapter(options),
} = {}) {
  const adapters = new Set();
  return {
    descriptor: OPENCODE_NATIVE_RUNTIME_DESCRIPTOR,
    discovery,
    createAdapter: ({ readiness, ...options }) => {
      let adapter;
      adapter = adapterFactory({
        ...options,
        readiness,
        appVersion,
        logger,
        runtimeDescriptor: OPENCODE_NATIVE_RUNTIME_DESCRIPTOR,
        managed: false,
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
