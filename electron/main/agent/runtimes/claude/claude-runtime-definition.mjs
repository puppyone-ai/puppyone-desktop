import { ClaudeAgentSdkAdapter } from "./claude-agent-sdk-adapter.mjs";
import { createClaudeDiscovery } from "./claude-discovery.mjs";
import { CLAUDE_RUNTIME_DESCRIPTOR } from "./claude-identity.mjs";

export { CLAUDE_RUNTIME_DESCRIPTOR } from "./claude-identity.mjs";

export function createClaudeRuntimeDefinition({
  appVersion = "0.0.0",
  sdkLoader = () => import("@anthropic-ai/claude-agent-sdk"),
  discovery = createClaudeDiscovery({ sdkLoader }),
  adapterFactory = (options) => new ClaudeAgentSdkAdapter(options),
  logger = console,
} = {}) {
  return {
    descriptor: CLAUDE_RUNTIME_DESCRIPTOR,
    discovery,
    createAdapter: (options) => adapterFactory({ ...options, appVersion, sdkLoader, logger }),
  };
}
