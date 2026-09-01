const TARGET_CATCH_UP_FRAMES = 6;

/**
 * Advances a presentation snapshot without mutating the authoritative text.
 * The adaptive step bounds visual lag even when a provider delivers a burst.
 */
export function nextAgentStreamText(displayed: string, authoritative: string) {
  if (!authoritative.startsWith(displayed)) return authoritative;
  if (displayed.length === authoritative.length) return displayed;
  const pending = splitGraphemes(authoritative.slice(displayed.length));
  const count = Math.max(1, Math.ceil(pending.length / TARGET_CATCH_UP_FRAMES));
  return displayed + pending.slice(0, count).join("");
}

/** Keeps incomplete Markdown in a plain-text tail so syntax completion cannot remount the live line. */
export function splitStreamingMarkdown(text: string) {
  const normalized = text.replace(/\r\n?/g, "\n");
  let openFence: OpenMarkdownFence | null = null;
  let safeBoundary = 0;
  let cursor = 0;

  for (const line of normalized.match(/.*(?:\n|$)/g) ?? []) {
    if (!line) continue;
    cursor += line.length;
    const content = line.endsWith("\n") ? line.slice(0, -1) : line;
    const nextFence = advanceOpenMarkdownFence(openFence, content);
    if (nextFence !== openFence) {
      openFence = nextFence;
      if (!openFence) safeBoundary = cursor;
      continue;
    }
    if (!openFence && content.trim() === "") safeBoundary = cursor;
  }

  return {
    stable: normalized.slice(0, safeBoundary),
    tail: normalized.slice(safeBoundary),
  };
}

export type OpenMarkdownFence = Readonly<{
  marker: "`" | "~";
  length: number;
  info: string;
}>;

/** CommonMark fence scanner shared by streaming and bounded head/tail windows. */
export function findOpenMarkdownFence(source: string): OpenMarkdownFence | null {
  let openFence: OpenMarkdownFence | null = null;
  for (const line of source.replace(/\r\n?/g, "\n").split("\n")) {
    openFence = advanceOpenMarkdownFence(openFence, line);
  }
  return openFence;
}

export function advanceOpenMarkdownFence(openFence: OpenMarkdownFence | null, line: string) {
  const match = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match) return openFence;
  const marker = match[1][0] as "`" | "~";
  const remainder = match[2];
  if (!openFence) {
    if (marker === "`" && remainder.includes("`")) return openFence;
    return { marker, length: match[1].length, info: remainder.trim() } satisfies OpenMarkdownFence;
  }
  if (openFence.marker !== marker || match[1].length < openFence.length || remainder.trim()) return openFence;
  return null;
}

function splitGraphemes(value: string) {
  if (typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(segmenter.segment(value), (entry) => entry.segment);
  }
  return Array.from(value);
}
