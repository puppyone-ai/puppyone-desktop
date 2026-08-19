import fs from "node:fs/promises";
import {
  isRecord,
  readOwnedJsonFile,
  writeOwnedJsonFileIfUnchanged,
} from "./owned-json-file.mjs";

const OWNED_EVENTS = Object.freeze({
  codex: Object.freeze(["PreToolUse", "PostToolUse", "SessionEnd"]),
  claude: Object.freeze(["PreToolUse", "PostToolUse", "PostToolUseFailure", "SessionEnd"]),
});

export function createOwnedJsonHookConfig({ configPath, providerId, command, fsService = fs }) {
  const events = OWNED_EVENTS[providerId];
  if (!events) throw new Error(`Provider ${providerId} does not use JSON Hook registration.`);

  async function inspect() {
    const source = await readOwnedJsonFile(configPath, fsService);
    if (source.error) return Object.freeze({ enrollment: "needs-repair", reason: "invalid-json" });
    const counts = countOwnedHandlers(source.value, command, events);
    if (counts.exact === events.length && counts.related === events.length) {
      return Object.freeze({ enrollment: "enabled" });
    }
    if (counts.exact === 0 && counts.related === 0) {
      return Object.freeze({ enrollment: "not-configured" });
    }
    return Object.freeze({ enrollment: "needs-repair", reason: "owned-entry-changed" });
  }

  async function enable() {
    const before = await readOwnedJsonFile(configPath, fsService);
    if (before.error) throw new Error("AGENT_ACTIVITY_CONFIG_INVALID_JSON");
    const counts = countOwnedHandlers(before.value, command, events);
    if (counts.related > counts.exact) throw new Error("AGENT_ACTIVITY_CONFIG_CONFLICT");
    const next = structuredClone(before.value);
    if (!isRecord(next.hooks)) next.hooks = {};
    for (const eventName of events) {
      const groups = Array.isArray(next.hooks[eventName]) ? next.hooks[eventName] : [];
      if (!hasExactHandler(groups, command)) {
        groups.push({ hooks: [createHandler(command)] });
      }
      next.hooks[eventName] = groups;
    }
    await writeOwnedJsonFileIfUnchanged({
      configPath,
      originalSource: before.source,
      value: next,
      fsService,
    });
    return inspect();
  }

  async function disable() {
    const before = await readOwnedJsonFile(configPath, fsService);
    if (before.error) throw new Error("AGENT_ACTIVITY_CONFIG_INVALID_JSON");
    const counts = countOwnedHandlers(before.value, command, events);
    if (counts.related > counts.exact) throw new Error("AGENT_ACTIVITY_CONFIG_CONFLICT");
    const next = structuredClone(before.value);
    for (const eventName of events) {
      if (!Array.isArray(next.hooks?.[eventName])) continue;
      next.hooks[eventName] = next.hooks[eventName]
        .map((group) => removeExactHandler(group, command))
        .filter(Boolean);
      if (next.hooks[eventName].length === 0) delete next.hooks[eventName];
    }
    if (isRecord(next.hooks) && Object.keys(next.hooks).length === 0) delete next.hooks;
    await writeOwnedJsonFileIfUnchanged({
      configPath,
      originalSource: before.source,
      value: next,
      fsService,
    });
    return inspect();
  }

  return Object.freeze({ inspect, enable, disable, configPath });
}

function createHandler(command) {
  return Object.freeze({ type: "command", command, timeout: 2 });
}

function countOwnedHandlers(value, command, events) {
  let exact = 0;
  let related = 0;
  for (const eventName of events) {
    const handlers = getHandlers(value.hooks?.[eventName]);
    if (handlers.some((handler) => isExactHandler(handler, command))) exact += 1;
    if (handlers.some(isRelatedHandler)) related += 1;
  }
  return { exact, related };
}

function getHandlers(groups) {
  if (!Array.isArray(groups)) return [];
  return groups.flatMap((group) => Array.isArray(group?.hooks) ? group.hooks : []);
}

function hasExactHandler(groups, command) {
  return getHandlers(groups).some((handler) => isExactHandler(handler, command));
}

function isExactHandler(handler, command) {
  return isRecord(handler)
    && handler.type === "command"
    && handler.command === command
    && handler.timeout === 2;
}

function isRelatedHandler(handler) {
  return isRecord(handler)
    && typeof handler.command === "string"
    && handler.command.includes("puppyone-agent-hook.mjs");
}

function removeExactHandler(group, command) {
  if (!isRecord(group) || !Array.isArray(group.hooks)) return group;
  const hooks = group.hooks.filter((handler) => !isExactHandler(handler, command));
  return hooks.length > 0 ? { ...group, hooks } : null;
}
