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
    search: "Search",
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
  const tool = agentActivityToolName(activity);
  if (["Grep", "Glob", "Search"].includes(tool)) {
    return firstText(input.pattern, activity.detail.query, input.query, activity.detail.path, input.path, activity.label);
  }
  return firstText(
    activity.detail.description,
    activity.detail.path,
    input.path,
    input.file,
    input.file_path,
    input.filePath,
    activity.detail.query,
    input.query,
    input.pattern,
    activity.label,
  );
}

export function isContextCompactionActivity(activity: AgentActivity) {
  const input = record(activity.detail.input);
  const values = [
    activity.detail.tool,
    activity.detail.kind,
    activity.detail.description,
    input.action,
    activity.label,
  ].map(text).filter(Boolean);
  return values.some((value) => /^(?:compaction|context-compaction)$/u.test(value.toLowerCase())
    || /(?:compact(?:ed|ing|ion)?\s+(?:the\s+)?context|context\s+compact)/iu.test(value));
}

export function commandForActivity(activity: AgentActivity) {
  const input = record(activity.detail.input);
  const metadata = record(activity.detail.metadata);
  return firstText(activity.detail.command, input.command, input.cmd, metadata.command, typeof activity.detail.input === "string" ? activity.detail.input : "");
}

export type AgentCommandPresentation = {
  tool: "bash" | "read" | "grep" | "glob" | "list";
  title: "Bash" | "Read" | "Grep" | "Glob" | "List";
  summary: string;
  viaShell: boolean;
};

export function commandPresentationForActivity(activity: AgentActivity): AgentCommandPresentation {
  const command = commandForActivity(activity);
  const visibleCommand = unwrapLoginShell(command);
  const executable = readShellExecutable(visibleCommand);
  const simpleReadOnlyShell = !/[;&|<>`\n\r]/u.test(visibleCommand) && !/\$\(/u.test(visibleCommand);
  if (!simpleReadOnlyShell) {
    return { tool: "bash", title: "Bash", summary: command || activity.label, viaShell: false };
  }
  if (executable === "rg") {
    if (/(?:^|\s)--pre(?:-glob)?(?:\s|=|$)/u.test(visibleCommand)) {
      return { tool: "bash", title: "Bash", summary: command || activity.label, viaShell: false };
    }
    const filesOnly = /(?:^|\s)--files(?:\s|$)/u.test(visibleCommand);
    return { tool: filesOnly ? "glob" : "grep", title: filesOnly ? "Glob" : "Grep", summary: visibleCommand, viaShell: true };
  }
  if (executable === "grep" || executable === "git-grep") {
    return { tool: "grep", title: "Grep", summary: visibleCommand, viaShell: true };
  }
  if (executable === "find" || executable === "fd") {
    if (executable === "find" && /(?:^|\s)-(?:delete|exec|execdir|ok|okdir|fprint|fprintf|fls)(?:\s|$)/u.test(visibleCommand)) {
      return { tool: "bash", title: "Bash", summary: command || activity.label, viaShell: false };
    }
    return { tool: "glob", title: "Glob", summary: visibleCommand, viaShell: true };
  }
  if (executable === "ls") {
    return { tool: "list", title: "List", summary: visibleCommand, viaShell: true };
  }
  if (["cat", "head", "tail", "bat", "sed-read", "nl-read"].includes(executable)) {
    return { tool: "read", title: "Read", summary: visibleCommand, viaShell: true };
  }
  return { tool: "bash", title: "Bash", summary: command || activity.label, viaShell: false };
}

export function pathForActivity(activity: AgentActivity) {
  const input = record(activity.detail.input);
  const firstChange = fileChangesForActivity(activity)[0];
  return firstText(activity.detail.path, input.path, input.file, input.filepath, input.file_path, input.filePath, firstChange?.path);
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
  const durationMs = finiteNumber(activity.detail.duration, activity.detail.durationMs, activity.detail.elapsedMs, metadata.duration, metadata.durationMs, metadata.elapsed);
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
  const oldText = firstText(input.old_string, input.oldString);
  const newText = firstText(input.new_string, input.newString);
  if (oldText || newText) {
    const lines: AgentDiffLine[] = [
      { kind: "hunk", text: "@@" },
      ...oldText.split(/\r?\n/u).slice(0, 119).map((line) => ({ kind: "deletion" as const, text: `-${line}` })),
      ...newText.split(/\r?\n/u).slice(0, 119).map((line) => ({ kind: "addition" as const, text: `+${line}` })),
    ];
    return lines.slice(0, 240);
  }
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

function unwrapLoginShell(command: string) {
  const match = command.trim().match(/^(?:\/[^\s]+\/)?(?:zsh|bash|sh)\s+-lc\s+(["'])([\s\S]*)\1$/u);
  return (match?.[2] || command).trim();
}

function readShellExecutable(command: string) {
  const source = command.trim();
  if (!source) return "";
  if (/^(?:command\s+)?git\s+grep(?:\s|$)/u.test(source)) return "git-grep";
  const match = source.match(/^(?:command\s+)?(?:env\s+)?(?:[A-Za-z_][A-Za-z0-9_]*=[^\s]+\s+)*(?:\/[^\s]+\/)?([A-Za-z0-9._+-]+)(?:\s|$)/u);
  const executable = match?.[1]?.toLowerCase() || "";
  if (executable === "sed" && /(?:^|\s)-n(?:\s|$)/u.test(source)) return "sed-read";
  if (executable === "nl" && /(?:^|\s)-ba(?:\s|$)/u.test(source)) return "nl-read";
  return executable;
}
