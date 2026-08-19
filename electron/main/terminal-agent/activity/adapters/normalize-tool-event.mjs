import { AGENT_ACTIVITY_SCHEMA_VERSION } from "../../../../../shared/agent-activity-contract/constants.mjs";

export function normalizeProjectedToolEvent({
  payload,
  providerId,
  terminalSessionId,
  phase,
  toolGroups,
  occurredAt = Date.now(),
}) {
  if (!payload || !phase) return null;
  const classifiedOperation = classifyTool(payload.toolName, toolGroups);
  const operation = classifiedOperation === "command" && Array.isArray(payload.input?.read_paths)
    ? "file.read"
    : classifiedOperation;
  const targets = operation === "command" || operation === "subagent" || operation === "tool"
    ? []
    : createTargets(payload.input, operation);
  return Object.freeze({
    schemaVersion: AGENT_ACTIVITY_SCHEMA_VERSION,
    sourceSurface: "terminal",
    providerId,
    terminalSessionId,
    sourceSessionId: payload.sessionId ?? null,
    nativeTurnId: payload.turnId ?? null,
    nativeToolCallId: payload.toolCallId,
    nativeToolName: payload.toolName,
    phase,
    operation,
    cwd: payload.cwd,
    targets: Object.freeze(targets),
    occurredAt,
  });
}

export function createPhaseResolver(mapping) {
  const normalized = new Map(Object.entries(mapping).map(([key, value]) => [key.toLowerCase(), value]));
  return (eventName) => normalized.get(String(eventName).toLowerCase()) ?? null;
}

function classifyTool(toolName, groups) {
  const name = String(toolName).toLowerCase();
  for (const [operation, patterns] of Object.entries(groups)) {
    if (patterns.some((pattern) => pattern.test(name))) return operation;
  }
  return "tool";
}

function createTargets(input, operation) {
  const entries = Object.entries(input ?? {});
  const targets = [];
  for (const [key, item] of entries) {
    for (const candidate of Array.isArray(item) ? item : [item]) {
      if (typeof candidate !== "string") continue;
      targets.push({
        kind: "file",
        path: candidate,
        access: accessFor(operation, key),
        confidence: "exact",
      });
    }
  }
  const seen = new Set();
  return targets.filter((target) => {
    const key = `${target.path}\0${target.access}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function accessFor(operation, key) {
  if (operation === "file.read") return "read";
  if (operation === "file.search") return "search";
  if (operation === "file.delete") return "delete";
  if (operation === "file.move") {
    return /^(?:source_path|old_path|from)$/u.test(key) ? "move-from" : "move-to";
  }
  return "write";
}

export const DEFAULT_TOOL_GROUPS = Object.freeze({
  command: Object.freeze([/^(?:bash|shell|terminal|exec|exec_command)$/u]),
  subagent: Object.freeze([/^(?:agent|task|delegate_task|spawn_agent)$/u]),
  "file.delete": Object.freeze([/(?:delete|remove|unlink).*(?:file|path)|^(?:delete_file|remove_file)$/u]),
  "file.move": Object.freeze([/(?:move|rename).*(?:file|path)|^(?:move_file|rename_file)$/u]),
  "file.write": Object.freeze([/(?:write|edit|patch|replace|create|save|apply_patch)/u]),
  "file.search": Object.freeze([/(?:grep|glob|search|find|list_files)/u]),
  "file.read": Object.freeze([/(?:read|view|open|get).*(?:file|path)?/u]),
});
