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
  let inFence = false;
  let safeBoundary = 0;
  let cursor = 0;

  for (const line of normalized.match(/.*(?:\n|$)/g) ?? []) {
    if (!line) continue;
    cursor += line.length;
    const content = line.endsWith("\n") ? line.slice(0, -1) : line;
    const fence = /^```/.test(content.trimStart());
    if (fence) {
      inFence = !inFence;
      if (!inFence) safeBoundary = cursor;
      continue;
    }
    if (!inFence && content.trim() === "") safeBoundary = cursor;
  }

  return {
    stable: normalized.slice(0, safeBoundary),
    tail: normalized.slice(safeBoundary),
  };
}

function splitGraphemes(value: string) {
  if (typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(segmenter.segment(value), (entry) => entry.segment);
  }
  return Array.from(value);
}
