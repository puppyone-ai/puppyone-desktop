import type { AgentActivity } from "./agent-projection-types";

export type AgentFileChangeSummary = {
  path: string;
  additions: number;
  deletions: number;
};

export type AgentDiffLine = { kind: "addition" | "deletion" | "hunk" | "context"; text: string };

export function agentActivityToolName(activity: AgentActivity) {
  const tool = text(activity.detail.tool || activity.kind).toLowerCase();
  const known: Record<string, string> = {
    bash: "Bash",
    shell: "Bash",
    command: "Bash",
    read: "Read",
    write: "Write",
    edit: "Edit",
    apply_patch: "Edit",
    patch: "Edit",
    glob: "Glob",
    grep: "Grep",
    list: "List",
    webfetch: "Fetch",
    websearch: "Search",
    reasoning: "Thinking",
    plan: "Plan",
  };
  return known[tool] || titleCase(tool || activity.label || "Tool");
}

export function agentActivitySummary(activity: AgentActivity) {
  if (activity.kind === "command") return commandForActivity(activity) || activity.label;
  if (activity.kind === "file-change") return pathForActivity(activity) || activity.label;
  const input = record(activity.detail.input);
  return firstText(
    activity.detail.description,
    activity.detail.path,
    input.path,
    input.file,
    activity.detail.query,
    input.query,
    activity.label,
  );
}

export function commandForActivity(activity: AgentActivity) {
  const input = record(activity.detail.input);
  const metadata = record(activity.detail.metadata);
  return firstText(activity.detail.command, input.command, input.cmd, metadata.command, typeof activity.detail.input === "string" ? activity.detail.input : "");
}

export function pathForActivity(activity: AgentActivity) {
  const input = record(activity.detail.input);
  const firstChange = fileChangesForActivity(activity)[0];
  return firstText(activity.detail.path, input.path, input.file, input.filepath, firstChange?.path);
}

export function outputForActivity(activity: AgentActivity) {
  return firstText(
    activity.output,
    activity.detail.outputPreview,
    activity.detail.content,
    activity.detail.error,
    typeof activity.detail.detail === "string" ? activity.detail.detail : "",
  );
}

export function commandMetadata(activity: AgentActivity) {
  const metadata = record(activity.detail.metadata);
  const exitCode = finiteNumber(activity.detail.exitCode, metadata.exitCode, metadata.exit, metadata.code);
  const durationMs = finiteNumber(activity.detail.duration, metadata.duration, metadata.durationMs, metadata.elapsed);
  return {
    exitCode,
    duration: durationMs === null ? null : formatDuration(durationMs),
  };
}

export function fileChangesForActivity(activity: AgentActivity): AgentFileChangeSummary[] {
  if (!Array.isArray(activity.detail.changes)) return [];
  return activity.detail.changes.slice(0, 100).flatMap((entry) => {
    const value = record(entry);
    const path = firstText(value.path, value.file, value.filepath);
    if (!path) return [];
    return [{
      path: path.slice(0, 4_096),
      additions: boundedCount(value.additions),
      deletions: boundedCount(value.deletions),
    }];
  });
}

export function diffLinesForActivity(activity: AgentActivity): AgentDiffLine[] {
  const input = record(activity.detail.input);
  const source = firstText(
    activity.detail.diff,
    activity.detail.patch,
    input.diff,
    input.patch,
    input.content,
  );
  if (!source || !/(^|\n)(?:@@|\+|-)/.test(source)) return [];
  return source.split(/\r?\n/).slice(0, 240).map((line) => ({
    kind: line.startsWith("@@")
      ? "hunk"
      : line.startsWith("+") && !line.startsWith("+++")
        ? "addition"
        : line.startsWith("-") && !line.startsWith("---")
          ? "deletion"
          : "context",
    text: line.slice(0, 4_096),
  }));
}

export function structuredInputForActivity(activity: AgentActivity) {
  const input = activity.detail.input;
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const visible = Object.fromEntries(Object.entries(input as Record<string, unknown>)
    .filter(([key]) => !["command", "cmd", "patch", "diff", "content"].includes(key))
    .slice(0, 20));
  return Object.keys(visible).length ? JSON.stringify(visible, null, 2).slice(0, 32 * 1024) : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 64 * 1024);
  }
  return "";
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function finiteNumber(...values: unknown[]) {
  for (const value of values) if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function boundedCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1_000_000, Math.trunc(value))) : 0;
}

function formatDuration(value: number) {
  if (value < 1_000) return `${Math.max(0, Math.round(value))} ms`;
  if (value < 60_000) return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)} s`;
  return `${Math.floor(value / 60_000)}m ${Math.round((value % 60_000) / 1_000)}s`;
}

function titleCase(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
