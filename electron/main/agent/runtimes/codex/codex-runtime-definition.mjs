import { CodexAppServerAdapter } from "./codex-app-server-adapter.mjs";
import { createCodexDiscovery } from "./codex-discovery.mjs";

export const CODEX_RUNTIME_DESCRIPTOR = Object.freeze({
  id: "codex",
  displayName: "Codex CLI",
  description: "Direct compatibility runtime using the user's local Codex app-server and existing Codex authentication.",
  kind: "direct-cli",
  iconKey: "codex",
  priority: 50,
});

export function createCodexRuntimeDefinition({
  appVersion,
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
