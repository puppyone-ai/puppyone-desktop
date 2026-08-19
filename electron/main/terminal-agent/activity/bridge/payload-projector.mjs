import { createHash } from "node:crypto";
import { projectShellReadPaths } from "./shell-file-intent.mjs";

const PROJECTOR_LIMITS = Object.freeze({
  frameBytes: 64 * 1024,
  pathLength: 4_096,
  stringLength: 512,
  targetsPerActivity: 32,
});

const PATH_KEYS = new Set([
  "file_path",
  "filepath",
  "path",
  "paths",
  "directory",
  "root",
  "target_path",
  "source_path",
  "old_path",
  "new_path",
  "from",
  "to",
]);

export function projectAgentHookPayload(rawValue) {
  if (!isRecord(rawValue)) return null;
  const eventName = firstString(rawValue.hook_event_name, rawValue.event_name, rawValue.event);
  const toolName = firstString(rawValue.tool_name, rawValue.tool?.name, rawValue.name) ?? "unknown";
  const cwd = firstString(rawValue.cwd, rawValue.working_directory, process.cwd());
  if (!eventName || !cwd) return null;
  const nativeInput = firstRecord(rawValue.tool_input, rawValue.input, rawValue.args) ?? {};
  const input = projectPathInput(nativeInput, toolName);
  const shellReadPaths = projectShellReadPaths(toolName, nativeInput);
  if (shellReadPaths.length > 0) input.read_paths = shellReadPaths;
  const sessionId = nullableString(firstString(
    rawValue.session_id,
    rawValue.conversation_id,
    rawValue.task_id,
  ));
  const turnId = nullableString(firstString(rawValue.turn_id, rawValue.extra?.turn_id));
  const toolCallId = firstString(
    rawValue.tool_use_id,
    rawValue.tool_call_id,
    rawValue.call_id,
    rawValue.extra?.tool_call_id,
  ) ?? fallbackToolCallId({ sessionId, turnId, toolName, input });
  return Object.freeze({
    eventName: bounded(eventName, 96),
    sessionId: sessionId ? bounded(sessionId, 160) : null,
    turnId: turnId ? bounded(turnId, 160) : null,
    toolCallId: bounded(toolCallId, 160),
    toolName: bounded(toolName, PROJECTOR_LIMITS.stringLength),
    cwd: bounded(cwd, PROJECTOR_LIMITS.pathLength),
    input: Object.freeze(input),
  });
}

export function projectPathInput(value, toolName = "") {
  const projected = {};
  const collectedPaths = [];
  collectPathFields(value, projected, collectedPaths, 0);
  if (/apply[_-]?patch|patch/i.test(toolName)) {
    const command = typeof value.command === "string" ? value.command : "";
    collectedPaths.push(...extractPatchPaths(command));
  }
  const paths = dedupePaths(collectedPaths);
  if (paths.length > 0) projected.paths = paths;
  return projected;
}

export function extractPatchPaths(command) {
  if (typeof command !== "string" || command.length > PROJECTOR_LIMITS.frameBytes * 4) return [];
  const paths = [];
  for (const line of command.split(/\r?\n/u)) {
    const marker = line.match(/^\*\*\* (?:Add|Update|Delete) File:\s+(.+)$/u)
      ?? line.match(/^\*\*\* Move to:\s+(.+)$/u)
      ?? line.match(/^(?:---|\+\+\+)\s+(?:[ab]\/)?([^\t]+)(?:\t.*)?$/u);
    if (!marker || marker[1] === "/dev/null") continue;
    const candidate = sanitizePath(marker[1]);
    if (candidate) paths.push(candidate);
    if (paths.length >= PROJECTOR_LIMITS.targetsPerActivity) break;
  }
  return dedupePaths(paths);
}

function collectPathFields(value, projected, collectedPaths, depth) {
  if (!isRecord(value) || depth > 3) return;
  for (const [rawKey, item] of Object.entries(value)) {
    const key = rawKey.toLowerCase();
    if (PATH_KEYS.has(key)) {
      const paths = Array.isArray(item) ? item.map(sanitizePath).filter(Boolean) : [sanitizePath(item)].filter(Boolean);
      if (paths.length === 1 && key !== "paths") projected[key] = paths[0];
      else collectedPaths.push(...paths);
      continue;
    }
    if (isRecord(item)) collectPathFields(item, projected, collectedPaths, depth + 1);
    if (Array.isArray(item)) {
      for (const entry of item.slice(0, PROJECTOR_LIMITS.targetsPerActivity)) {
        if (isRecord(entry)) collectPathFields(entry, projected, collectedPaths, depth + 1);
      }
    }
  }
}

function sanitizePath(value) {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  return candidate.length > 0
    && candidate.length <= PROJECTOR_LIMITS.pathLength
    && !/[\0-\x1f\x7f]/u.test(candidate)
    ? candidate
    : null;
}

function dedupePaths(values) {
  return Array.from(new Set(values.filter(Boolean))).slice(0, PROJECTOR_LIMITS.targetsPerActivity);
}

function fallbackToolCallId({ sessionId, turnId, toolName, input }) {
  return `derived-${createHash("sha256")
    .update(JSON.stringify([sessionId, turnId, toolName, input]))
    .digest("hex")
    .slice(0, 24)}`;
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.length > 0) ?? null;
}

function firstRecord(...values) {
  return values.find(isRecord) ?? null;
}

function nullableString(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function bounded(value, maxLength) {
  return String(value).slice(0, maxLength).replace(/[\0\r\n]/gu, " ");
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
