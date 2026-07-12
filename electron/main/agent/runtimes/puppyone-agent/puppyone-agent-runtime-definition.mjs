import { createOpenCodeDiscovery } from "./managed-opencode-discovery.mjs";
import { OpenCodeSidecarAdapter } from "../opencode-protocol/opencode-sidecar-adapter.mjs";
import { OpenCodeSidecarHost } from "../opencode-protocol/opencode-sidecar-host.mjs";
import { PUPPYONE_AGENT_RUNTIME_DESCRIPTOR } from "./puppyone-agent-identity.mjs";

export function createPuppyOneAgentRuntimeDefinition({
  appPath = null,
  resourcesPath = process.resourcesPath,
  managedConfigDir = null,
  allowExternal = false,
  logger = console,
  discovery = createOpenCodeDiscovery({ appPath, resourcesPath, managedConfigDir, allowExternal }),
  host = new OpenCodeSidecarHost({ logger, runtimeLabel: "PuppyOne Agent engine" }),
} = {}) {
  return {
    descriptor: PUPPYONE_AGENT_RUNTIME_DESCRIPTOR,
    discovery,
    createAdapter: ({ readiness, ...options }) => new OpenCodeSidecarAdapter({
      ...options,
      readiness,
      host,
      runtimeDescriptor: PUPPYONE_AGENT_RUNTIME_DESCRIPTOR,
      managed: true,
    }),
    hasActiveResources: () => host.snapshot().state !== "idle",
    dispose: () => host.stop(),
  };
}
