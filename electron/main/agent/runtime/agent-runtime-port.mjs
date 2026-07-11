export const REQUIRED_AGENT_RUNTIME_METHODS = Object.freeze([
  "inspect",
  "createSession",
  "resumeSession",
  "startTurn",
  "interruptTurn",
  "dispose",
]);

export const AGENT_RUNTIME_CAPABILITIES = Object.freeze([
  "streamingText",
  "structuredToolEvents",
  "commandOutputStreaming",
  "fileChangeEvents",
  "manualApprovals",
  "structuredQuestions",
  "resume",
  "fork",
  "steer",
  "queue",
  "attachments",
  "contextReferences",
  "modelSelection",
  "modeSelection",
  "slashCommands",
  "sessionHistory",
  "usage",
  "accountState",
  "mcp",
  "skills",
  "compaction",
]);

export function assertAgentRuntimePort(adapter, runtimeId = "unknown") {
  if (!adapter || typeof adapter !== "object") throw new TypeError(`Agent runtime ${runtimeId} did not create an adapter.`);
  for (const method of REQUIRED_AGENT_RUNTIME_METHODS) {
    if (typeof adapter[method] !== "function") throw new TypeError(`Agent runtime ${runtimeId} is missing ${method}().`);
  }
  return adapter;
}

export function normalizeCapabilitySnapshot(value = {}) {
  return Object.fromEntries(AGENT_RUNTIME_CAPABILITIES.map((capability) => [capability, value[capability] === true]));
}

