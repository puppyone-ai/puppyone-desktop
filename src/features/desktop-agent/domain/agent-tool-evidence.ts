export type AgentToolEvidenceLimits = {
  maxChars: number;
  maxLines: number;
  maxLineChars: number;
  headLines: number;
  tailLines: number;
};

export type AgentToolEvidencePreview = {
  head: string;
  tail: string;
  sourceLength: number;
  totalLines: number;
  omittedChars: number;
  omittedLines: number;
  truncated: boolean;
};

export type AgentToolResultLines = {
  lines: string[];
  totalLines: number;
  omittedLines: number;
};

export const agentToolEvidenceLimits = Object.freeze<AgentToolEvidenceLimits>({
  maxChars: 24 * 1024,
  maxLines: 400,
  maxLineChars: 4 * 1024,
  headLines: 300,
  tailLines: 80,
});

const INPUT_TEXT_BUDGET = 8 * 1024;
const INPUT_NODE_BUDGET = 512;
const INPUT_COLLECTION_BUDGET = 40;
const INPUT_DEPTH_BUDGET = 8;

/**
 * Turns provider output into a bounded rendering model. The source remains
 * available for explicit copy, but React never receives an unbounded text node.
 */
export function createAgentToolEvidencePreview(
  source: string,
  limits: AgentToolEvidenceLimits = agentToolEvidenceLimits,
): AgentToolEvidencePreview {
  if (!source) return emptyPreview();
  const stats = scanText(source);
  const truncated = source.length > limits.maxChars
    || stats.lines > limits.maxLines
    || stats.longestLine > limits.maxLineChars;
  if (!truncated) {
    return {
      head: source,
      tail: "",
      sourceLength: source.length,
      totalLines: stats.lines,
      omittedChars: 0,
      omittedLines: 0,
      truncated: false,
    };
  }

  const headBudget = Math.max(1, Math.floor(limits.maxChars * 0.75));
  const tailBudget = Math.max(0, limits.maxChars - headBudget);
  const head = collectHead(source, limits.headLines, limits.maxLineChars, headBudget);
  const remainingLines = Math.max(0, stats.lines - head.lines);
  const tail = remainingLines > 0
    ? collectTail(source, Math.min(limits.tailLines, remainingLines), limits.maxLineChars, tailBudget)
    : { text: "", rawChars: 0, lines: 0 };
  const capturedChars = Math.min(source.length, head.rawChars + tail.rawChars);
  const capturedLines = Math.min(stats.lines, head.lines + tail.lines);
  return {
    head: head.text,
    tail: tail.text,
    sourceLength: source.length,
    totalLines: stats.lines,
    omittedChars: Math.max(0, source.length - capturedChars),
    omittedLines: Math.max(0, stats.lines - capturedLines),
    truncated: true,
  };
}

/** Collects only the rows the search/list UI can mount. */
export function collectAgentToolResultLines(
  source: string,
  maxLines = 80,
  maxLineChars = agentToolEvidenceLimits.maxLineChars,
): AgentToolResultLines {
  const lines: string[] = [];
  let totalLines = 0;
  forEachLine(source, (start, end) => {
    const value = source.slice(start, end);
    if (!value.trim()) return;
    totalLines += 1;
    if (lines.length < maxLines) lines.push(clipLine(value, maxLineChars));
  });
  return { lines, totalLines, omittedLines: Math.max(0, totalLines - lines.length) };
}

/**
 * Serializes structured tool input after applying aggregate node/text/depth
 * budgets. This avoids allocating an arbitrarily large JSON string and slicing
 * it after the fact.
 */
export function stringifyAgentToolInput(value: unknown) {
  const state = {
    remainingChars: INPUT_TEXT_BUDGET,
    remainingNodes: INPUT_NODE_BUDGET,
    seen: new WeakSet<object>(),
  };
  const bounded = boundInputValue(value, state, 0);
  if (!bounded || typeof bounded !== "object" || Array.isArray(bounded)) return null;
  if (Object.keys(bounded).length === 0) return null;
  return JSON.stringify(bounded, null, 2).slice(0, 32 * 1024);
}

function scanText(source: string) {
  let lines = 0;
  let longestLine = 0;
  forEachLine(source, (start, end) => {
    lines += 1;
    longestLine = Math.max(longestLine, end - start);
  });
  return { lines, longestLine };
}

function collectHead(source: string, maxLines: number, maxLineChars: number, maxChars: number) {
  const values: string[] = [];
  let used = 0;
  let rawChars = 0;
  let lines = 0;
  forEachLine(source, (start, end, stop) => {
    if (lines >= maxLines || used >= maxChars) return stop();
    const separator = values.length > 0 ? 1 : 0;
    const available = Math.max(0, maxChars - used - separator);
    if (available <= 0) return stop();
    const rawLength = end - start;
    const clipped = clipLine(source.slice(start, end), Math.min(maxLineChars, available));
    values.push(clipped);
    used += separator + clipped.length;
    rawChars += Math.min(rawLength, clipped.length);
    lines += 1;
  });
  return { text: values.join("\n"), rawChars, lines };
}

function collectTail(source: string, maxLines: number, maxLineChars: number, maxChars: number) {
  const values: Array<{ text: string; rawChars: number }> = [];
  let used = 0;
  forEachLine(source, (start, end) => {
    const rawLength = end - start;
    const clipped = clipLine(source.slice(start, end), Math.min(maxLineChars, maxChars));
    values.push({ text: clipped, rawChars: Math.min(rawLength, clipped.length) });
    used += clipped.length + (values.length > 1 ? 1 : 0);
    while (values.length > maxLines || used > maxChars) {
      const removed = values.shift();
      if (!removed) break;
      used -= removed.text.length + (values.length > 0 ? 1 : 0);
    }
  });
  return {
    text: values.map((entry) => entry.text).join("\n"),
    rawChars: values.reduce((sum, entry) => sum + entry.rawChars, 0),
    lines: values.length,
  };
}

function clipLine(value: string, maxChars: number) {
  if (value.length <= maxChars) return value;
  if (maxChars <= 1) return "…".slice(0, maxChars);
  return `${value.slice(0, maxChars - 1)}…`;
}

function forEachLine(
  source: string,
  visit: (start: number, end: number, stop: () => void) => void,
) {
  if (!source) return;
  let stopped = false;
  const stop = () => { stopped = true; };
  let start = 0;
  while (!stopped && start <= source.length) {
    const newline = source.indexOf("\n", start);
    const rawEnd = newline === -1 ? source.length : newline;
    const end = rawEnd > start && source.charCodeAt(rawEnd - 1) === 13 ? rawEnd - 1 : rawEnd;
    visit(start, end, stop);
    if (newline === -1) break;
    start = newline + 1;
  }
}

function boundInputValue(
  value: unknown,
  state: { remainingChars: number; remainingNodes: number; seen: WeakSet<object> },
  depth: number,
): unknown {
  if (state.remainingNodes <= 0 || state.remainingChars <= 0 || depth > INPUT_DEPTH_BUDGET) return "[truncated]";
  state.remainingNodes -= 1;
  if (typeof value === "string") {
    const length = Math.min(value.length, state.remainingChars, 4 * 1024);
    state.remainingChars -= length;
    return value.length > length ? `${value.slice(0, Math.max(0, length - 1))}…` : value;
  }
  if (!value || typeof value !== "object") return value;
  if (state.seen.has(value)) return "[circular]";
  state.seen.add(value);
  if (Array.isArray(value)) {
    return value.slice(0, INPUT_COLLECTION_BUDGET)
      .map((entry) => boundInputValue(entry, state, depth + 1));
  }
  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value).slice(0, INPUT_COLLECTION_BUDGET)) {
    if (state.remainingNodes <= 0 || state.remainingChars <= 0) {
      next["…"] = "[truncated]";
      break;
    }
    next[key.slice(0, 512)] = boundInputValue(entry, state, depth + 1);
  }
  return next;
}

function emptyPreview(): AgentToolEvidencePreview {
  return {
    head: "",
    tail: "",
    sourceLength: 0,
    totalLines: 0,
    omittedChars: 0,
    omittedLines: 0,
    truncated: false,
  };
}
