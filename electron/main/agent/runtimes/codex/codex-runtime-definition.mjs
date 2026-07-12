import { CodexAppServerAdapter } from "./codex-app-server-adapter.mjs";
import { createCodexDiscovery } from "./codex-discovery.mjs";

export const CODEX_RUNTIME_DESCRIPTOR = Object.freeze({
  id: "codex",
  displayName: "Codex",
  description: "Codex's native app-server, login, models, tools, approvals and sessions.",
  kind: "native-cli",
  iconKey: "codex",
  priority: 50,
  distribution: "user-installed",
});

export function createCodexRuntimeDefinition({
  appVersion = "0.0.0",
  discovery = createCodexDiscovery(),
  adapterFactory = (options) => new CodexAppServerAdapter(options),
} = {}) {
  return {
    descriptor: CODEX_RUNTIME_DESCRIPTOR,
    discovery,
    createAdapter: ({ readiness, ...options }) => adapterFactory({
      ...options,
      executablePath: readiness.executablePath,
      environment: readiness.environment,
      appVersion,
    }),
  };
}
