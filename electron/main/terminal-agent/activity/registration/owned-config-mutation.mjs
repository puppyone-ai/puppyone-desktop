import fs from "node:fs/promises";
import path from "node:path";

const OWNED_EVENTS = Object.freeze({
  codex: Object.freeze(["PreToolUse", "PostToolUse", "SessionEnd"]),
  claude: Object.freeze(["PreToolUse", "PostToolUse", "PostToolUseFailure", "SessionEnd"]),
});

export function createOwnedJsonHookConfig({ configPath, providerId, command, fsService = fs }) {
  const events = OWNED_EVENTS[providerId];
  if (!events) throw new Error(`Provider ${providerId} does not use JSON Hook registration.`);

  async function inspect() {
    const source = await readSource(configPath, fsService);
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
    const before = await readSource(configPath, fsService);
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
    await writeIfUnchanged(configPath, before.source, next, fsService);
    return inspect();
  }

  async function disable() {
    const before = await readSource(configPath, fsService);
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
    await writeIfUnchanged(configPath, before.source, next, fsService);
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

async function readSource(configPath, fsService) {
  let source;
  try {
    source = await fsService.readFile(configPath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return { source: null, value: {} };
  }
  try {
    const value = JSON.parse(source);
    return isRecord(value) ? { source, value } : { source, value: {}, error: true };
  } catch {
    return { source, value: {}, error: true };
  }
}

async function writeIfUnchanged(configPath, originalSource, value, fsService) {
  const latest = await readSource(configPath, fsService);
  if (latest.source !== originalSource) throw new Error("AGENT_ACTIVITY_CONFIG_CHANGED");
  await fsService.mkdir(path.dirname(configPath), { recursive: true, mode: 0o700 });
  const tempPath = `${configPath}.puppyone-${process.pid}-${Date.now()}.tmp`;
  const source = `${JSON.stringify(value, null, 2)}\n`;
  try {
    await fsService.writeFile(tempPath, source, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await fsService.rename(tempPath, configPath);
    await fsService.chmod(configPath, 0o600).catch(() => undefined);
  } catch (error) {
    await fsService.unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
