import { CODEX_LOCAL_TOOL } from "./codex-tool.mjs";
import { CURSOR_LOCAL_TOOL } from "./cursor-tool.mjs";

const DEFAULT_LOCAL_AGENT_TOOLS = Object.freeze([CODEX_LOCAL_TOOL, CURSOR_LOCAL_TOOL]);

export function createLocalAgentToolRegistry(descriptors = DEFAULT_LOCAL_AGENT_TOOLS) {
  const seen = new Set();
  return Object.freeze(Array.from(descriptors, (descriptor) => {
    validateDescriptor(descriptor);
    if (seen.has(descriptor.id)) throw new Error(`Duplicate local Agent tool descriptor: ${descriptor.id}`);
    seen.add(descriptor.id);
    return Object.freeze({
      id: descriptor.id,
      displayName: descriptor.displayName,
      executableNames: Object.freeze([...descriptor.executableNames]),
      probe: descriptor.probe,
      unavailableMessage: descriptor.unavailableMessage,
    });
  }));
}

function validateDescriptor(descriptor) {
  if (!descriptor || !/^[a-z0-9][a-z0-9._-]{0,79}$/.test(descriptor.id)) {
    throw new TypeError("Local Agent tool descriptor id is invalid.");
  }
  if (typeof descriptor.displayName !== "string" || !descriptor.displayName.trim()) {
    throw new TypeError(`Local Agent tool ${descriptor.id} requires a display name.`);
  }
  if (!Array.isArray(descriptor.executableNames) || descriptor.executableNames.length === 0) {
    throw new TypeError(`Local Agent tool ${descriptor.id} requires executable candidates.`);
  }
  if (typeof descriptor.probe !== "function") {
    throw new TypeError(`Local Agent tool ${descriptor.id} requires a probe.`);
  }
  if (typeof descriptor.unavailableMessage !== "string" || !descriptor.unavailableMessage.trim()) {
    throw new TypeError(`Local Agent tool ${descriptor.id} requires an unavailable-state message.`);
  }
}

export const localAgentToolRegistryDefaults = DEFAULT_LOCAL_AGENT_TOOLS;
