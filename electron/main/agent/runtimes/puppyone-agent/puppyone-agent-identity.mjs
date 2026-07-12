import { OPENCODE_UPSTREAM } from "../opencode-protocol/opencode-manifest.mjs";

export const PUPPYONE_AGENT_RUNTIME_ID = "puppyone-agent";

export const PUPPYONE_AGENT_RUNTIME_DESCRIPTOR = Object.freeze({
  id: PUPPYONE_AGENT_RUNTIME_ID,
  displayName: "PuppyOne Agent",
  description: "PuppyOne's managed coding Agent, powered by a pinned and verified OpenCode kernel.",
  kind: "managed-harness",
  iconKey: "puppyone-agent",
  priority: 100,
  distribution: "bundled",
  upstream: OPENCODE_UPSTREAM,
});
