import { CodexAppServerAdapter } from "./codex-app-server-adapter.mjs";
import { createCodexDiscovery } from "./codex-discovery.mjs";
import {
  defineAgentRuntimeManifest,
  runtimeDescriptorFromManifest,
} from "../../runtime/agent-runtime-manifest.mjs";

export const CODEX_RUNTIME_MANIFEST = defineAgentRuntimeManifest({
  id: "codex",
  displayName: "Codex",
  description: "Codex's native app-server, login, models, tools, approvals and sessions.",
  iconKey: "codex",
  priority: 50,
  execution: {
    kind: "local-process",
    distribution: "user-installed",
    controller: "bundled-adapter",
  },
  protocol: { kind: "app-server", transport: "stdio-json-rpc" },
  integration: { kind: "specialized-native", adapter: "specialized" },
  trust: { level: "first-party", publisher: "OpenAI" },
  ownership: {
    harness: "runtime",
    credentials: ["runtime"],
    models: "runtime",
    billing: ["runtime"],
    session: "runtime",
  },
});

export const CODEX_RUNTIME_DESCRIPTOR = runtimeDescriptorFromManifest(CODEX_RUNTIME_MANIFEST);

export function createCodexRuntimeDefinition({
  appVersion = "0.0.0",
  discovery = createCodexDiscovery(),
  adapterFactory = (options) => new CodexAppServerAdapter(options),
} = {}) {
  return {
    manifest: CODEX_RUNTIME_MANIFEST,
    discovery,
    createAdapter: ({ readiness, ...options }) => adapterFactory({
      ...options,
      executablePath: readiness.executablePath,
      environment: readiness.environment,
      appVersion,
    }),
  };
}
