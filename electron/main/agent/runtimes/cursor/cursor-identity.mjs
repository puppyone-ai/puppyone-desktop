import {
  defineAgentRuntimeManifest,
  runtimeDescriptorFromManifest,
} from "../../runtime/agent-runtime-manifest.mjs";

export const CURSOR_RUNTIME_MANIFEST = defineAgentRuntimeManifest({
  id: "cursor",
  displayName: "Cursor Agent",
  description: "The user's Cursor Agent harness, account, permissions and sessions through Cursor's ACP endpoint.",
  iconKey: "cursor",
  priority: 20,
  execution: {
    kind: "local-process",
    distribution: "user-installed",
    controller: "bundled-adapter",
  },
  protocol: { kind: "acp", transport: "stdio-json-rpc" },
  integration: { kind: "native-protocol", adapter: "generic-acp" },
  trust: { level: "first-party", publisher: "Cursor" },
  ownership: {
    harness: "runtime",
    credentials: ["runtime"],
    models: "runtime",
    billing: ["runtime"],
    session: "runtime",
  },
});

export const CURSOR_RUNTIME_DESCRIPTOR = runtimeDescriptorFromManifest(CURSOR_RUNTIME_MANIFEST);
