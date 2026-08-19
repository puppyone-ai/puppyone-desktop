import fs from "node:fs/promises";
import {
  isRecord,
  readOwnedJsonFile,
  writeOwnedJsonFileIfUnchanged,
} from "./owned-json-file.mjs";

const CURSOR_CONFIG_VERSION = 1;
const CURSOR_TOOL_MATCHER = "Read|Write|Grep|Delete";
const CURSOR_EVENTS = Object.freeze([
  Object.freeze({ name: "preToolUse", matcher: CURSOR_TOOL_MATCHER }),
  Object.freeze({ name: "postToolUse", matcher: CURSOR_TOOL_MATCHER }),
  Object.freeze({ name: "postToolUseFailure", matcher: CURSOR_TOOL_MATCHER }),
  Object.freeze({ name: "sessionEnd", matcher: null }),
]);

export function createOwnedCursorCliHookConfig({ configPath, command, fsService = fs }) {
  async function inspect() {
    const source = await readOwnedJsonFile(configPath, fsService);
    if (source.error) return state("needs-repair", "invalid-json");
    const schemaError = validateSchema(source.value);
    if (schemaError) return state("needs-repair", schemaError);
    const counts = countOwnedHandlers(source.value, command);
    if (!counts.conflicting
        && counts.exact === CURSOR_EVENTS.length
        && counts.related === CURSOR_EVENTS.length) {
      return state("enabled");
    }
    if (counts.exact === 0 && counts.related === 0) return state("not-configured");
    return state("needs-repair", "owned-entry-changed");
  }

  async function enable() {
    const before = await readOwnedJsonFile(configPath, fsService);
    if (before.error) throw new Error("AGENT_ACTIVITY_CONFIG_INVALID_JSON");
    const schemaError = validateSchema(before.value);
    if (schemaError) throw new Error(`AGENT_ACTIVITY_CURSOR_CONFIG_${schemaError.toUpperCase().replaceAll("-", "_")}`);
    const counts = countOwnedHandlers(before.value, command);
    if (counts.conflicting) throw new Error("AGENT_ACTIVITY_CONFIG_CONFLICT");

    const next = structuredClone(before.value);
    next.version = CURSOR_CONFIG_VERSION;
    if (!isRecord(next.hooks)) next.hooks = {};
    for (const event of CURSOR_EVENTS) {
      const handlers = Array.isArray(next.hooks[event.name]) ? next.hooks[event.name] : [];
      const expected = createHandler(command, event.matcher);
      if (!handlers.some((handler) => isExactHandler(handler, expected))) handlers.push(expected);
      next.hooks[event.name] = handlers;
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
    const schemaError = validateSchema(before.value);
    if (schemaError) throw new Error(`AGENT_ACTIVITY_CURSOR_CONFIG_${schemaError.toUpperCase().replaceAll("-", "_")}`);
    const counts = countOwnedHandlers(before.value, command);
    if (counts.conflicting) throw new Error("AGENT_ACTIVITY_CONFIG_CONFLICT");

    const next = structuredClone(before.value);
    for (const event of CURSOR_EVENTS) {
      if (!Array.isArray(next.hooks?.[event.name])) continue;
      const expected = createHandler(command, event.matcher);
      next.hooks[event.name] = next.hooks[event.name]
        .filter((handler) => !isExactHandler(handler, expected));
      if (next.hooks[event.name].length === 0) delete next.hooks[event.name];
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

function validateSchema(value) {
  if (value.version !== undefined && value.version !== CURSOR_CONFIG_VERSION) return "unsupported-version";
  if (value.hooks !== undefined && !isRecord(value.hooks)) return "invalid-schema";
  for (const event of CURSOR_EVENTS) {
    if (value.hooks?.[event.name] !== undefined && !Array.isArray(value.hooks[event.name])) {
      return "invalid-schema";
    }
  }
  return null;
}

function countOwnedHandlers(value, command) {
  let exact = 0;
  let related = 0;
  let conflicting = false;
  for (const event of CURSOR_EVENTS) {
    const handlers = Array.isArray(value.hooks?.[event.name]) ? value.hooks[event.name] : [];
    const expected = createHandler(command, event.matcher);
    const exactHandlers = handlers.filter((handler) => isExactHandler(handler, expected));
    const relatedHandlers = handlers.filter(isRelatedHandler);
    exact += exactHandlers.length;
    related += relatedHandlers.length;
    if (exactHandlers.length > 1 || relatedHandlers.length !== exactHandlers.length) conflicting = true;
  }
  return { exact, related, conflicting };
}

function createHandler(command, matcher) {
  return Object.freeze({
    type: "command",
    command,
    timeout: 2,
    ...(matcher ? { matcher } : {}),
  });
}

function isExactHandler(handler, expected) {
  if (!isRecord(handler)) return false;
  const keys = Object.keys(handler).sort();
  const expectedKeys = Object.keys(expected).sort();
  return keys.length === expectedKeys.length
    && keys.every((key, index) => key === expectedKeys[index])
    && expectedKeys.every((key) => handler[key] === expected[key]);
}

function isRelatedHandler(handler) {
  return isRecord(handler)
    && typeof handler.command === "string"
    && handler.command.includes("puppyone-agent-hook.mjs");
}

function state(enrollment, reason) {
  return Object.freeze({ enrollment, ...(reason ? { reason } : {}) });
}
