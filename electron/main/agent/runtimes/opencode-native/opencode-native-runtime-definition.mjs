import { OpenCodeSidecarAdapter } from "../opencode-protocol/opencode-sidecar-adapter.mjs";
import { OpenCodeSidecarHost } from "../opencode-protocol/opencode-sidecar-host.mjs";
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
  host = new OpenCodeSidecarHost({ logger }),
} = {}) {
  return {
    descriptor: OPENCODE_NATIVE_RUNTIME_DESCRIPTOR,
    discovery,
    createAdapter: ({ readiness, ...options }) => new OpenCodeSidecarAdapter({
      ...options,
      readiness,
      host,
      runtimeDescriptor: OPENCODE_NATIVE_RUNTIME_DESCRIPTOR,
      managed: false,
    }),
    hasActiveResources: () => host.snapshot().state !== "idle",
    dispose: () => host.stop(),
  };
}
