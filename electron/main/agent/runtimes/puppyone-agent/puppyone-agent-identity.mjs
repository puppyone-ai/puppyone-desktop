import { OPENCODE_UPSTREAM } from "../opencode-protocol/opencode-manifest.mjs";
import {
  defineAgentRuntimeManifest,
  runtimeDescriptorFromManifest,
} from "../../runtime/agent-runtime-manifest.mjs";

export const PUPPYONE_AGENT_RUNTIME_ID = "puppyone-agent";

export const PUPPYONE_AGENT_RUNTIME_MANIFEST = defineAgentRuntimeManifest({
  id: PUPPYONE_AGENT_RUNTIME_ID,
  displayName: "PuppyOne Agent",
  description: "PuppyOne's managed coding Agent, powered by a pinned and verified OpenCode kernel.",
  iconKey: "puppyone-agent",
  priority: 100,
  execution: {
    kind: "managed-local-process",
    distribution: "bundled",
    controller: "bundled-adapter",
  },
  protocol: { kind: "acp", transport: "stdio-json-rpc" },
  integration: { kind: "managed-harness", adapter: "generic-acp" },
  trust: { level: "bundled-verified", publisher: "PuppyOne" },
  ownership: {
    harness: "puppyone",
    credentials: ["puppyone", "user-provider"],
    models: "puppyone",
    billing: ["puppyone", "user-provider"],
    session: "puppyone",
  },
});

export const PUPPYONE_AGENT_RUNTIME_DESCRIPTOR = Object.freeze({
  ...runtimeDescriptorFromManifest(PUPPYONE_AGENT_RUNTIME_MANIFEST),
  upstream: OPENCODE_UPSTREAM,
});
