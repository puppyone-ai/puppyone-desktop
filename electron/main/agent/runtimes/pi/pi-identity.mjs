import {
  defineAgentRuntimeManifest,
  runtimeDescriptorFromManifest,
} from "../../runtime/agent-runtime-manifest.mjs";

export const PI_RUNTIME_MANIFEST = defineAgentRuntimeManifest({
  id: "pi",
  displayName: "Pi",
  description: "The user's Pi coding-agent installation, providers, models, tools and native sessions.",
  iconKey: "pi",
  priority: 20,
  execution: {
    kind: "local-process",
    distribution: "user-installed",
    controller: "bundled-adapter",
  },
  protocol: { kind: "rpc", transport: "stdio-jsonl" },
  integration: { kind: "specialized-native", adapter: "specialized" },
  trust: { level: "first-party", publisher: "Pi" },
  ownership: {
    harness: "runtime",
    credentials: ["user-provider"],
    models: "runtime",
    billing: ["user-provider"],
    session: "runtime",
  },
  source: "official-pi-rpc",
  compatibility: "pi-rpc-v1",
});

export const PI_RUNTIME_DESCRIPTOR = runtimeDescriptorFromManifest(PI_RUNTIME_MANIFEST);
