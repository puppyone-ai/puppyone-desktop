import type { AgentEvent } from "./agent-contract";
import type { AgentActivity, AgentApproval, AgentQuestionPrompt } from "./agent-projection-types";

export function readQuestions(value: unknown): AgentQuestionPrompt[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    const question = readString(record.question).slice(0, 2_000);
    if (!question) return [];
    const options = Array.isArray(record.options) ? record.options.slice(0, 20).flatMap((option) => {
      if (!option || typeof option !== "object" || Array.isArray(option)) return [];
      const item = option as Record<string, unknown>;
      const label = readString(item.label).slice(0, 200);
      return label ? [{ label, description: readString(item.description).slice(0, 600) }] : [];
    }) : [];
    return [{
      header: readString(record.header).slice(0, 80),
      question,
      multiple: Boolean(record.multiple),
      custom: record.custom !== false,
      options,
    }];
  });
}

export function pickUsage(payload: Record<string, unknown>) {
  const usage: Record<string, unknown> = {};
  for (const key of ["inputTokens", "outputTokens", "cachedTokens", "cost", "contextWindow", "tokens"]) {
    const value = payload[key];
    if (typeof value === "number" && Number.isFinite(value)) usage[key] = value;
  }
  return usage;
}

export function pickSafeActivityDetail(payload: Record<string, unknown>) {
  const detail: Record<string, unknown> = {};
  for (const key of ["command", "cwd", "delta", "status", "kind", "tool", "description", "path", "changes", "steps", "title", "message", "input", "outputPreview", "error", "content", "detail", "outputPaths"]) {
    if (!(key in payload)) continue;
    detail[key] = boundProjectionValue(payload[key]);
  }
  return detail;
}

export function activityId(event: AgentEvent) {
  return `activity:${event.itemId ?? event.turnId ?? event.type}`;
}

export function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function nullableString(value: unknown) {
  const text = readString(value);
  return text || null;
}

export function readRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is Record<string, unknown> => (
    Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
  )).slice(0, 20);
}

export function readNetworkApprovalContext(value: unknown): AgentApproval["networkApprovalContext"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const host = readString(record.host).trim();
  const protocol = readString(record.protocol).trim();
  return host && protocol ? { host, protocol } : null;
}

export function defaultToolLabel(kind: AgentActivity["kind"]) {
  if (kind === "command") return "Command";
  if (kind === "file-change") return "File changes";
  return "Tool activity";
}

export function fileChangeLabel(payload: Record<string, unknown>) {
  const changes = Array.isArray(payload.changes) ? payload.changes : [];
  if (changes.length === 0) return "File changes";
  return changes.length === 1 ? "Changed 1 file" : `Changed ${changes.length} files`;
}

export function readApprovalDecisions(value: unknown): AgentApproval["availableDecisions"] {
  if (!Array.isArray(value)) return ["accept", "decline", "cancel"];
  const decisions = value.filter((entry): entry is AgentApproval["availableDecisions"][number] => (
    entry === "accept" || entry === "acceptForSession" || entry === "decline" || entry === "cancel"
  ));
  return decisions.length > 0 ? decisions : ["accept", "decline", "cancel"];
}

function boundProjectionValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (typeof value === "string") return value.slice(0, 64 * 1024);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((entry) => boundProjectionValue(entry, depth + 1));
  if (!value || typeof value !== "object") return undefined;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 40).map(([key, entry]) => [
    key.slice(0, 100),
    boundProjectionValue(entry, depth + 1),
  ]));
}
