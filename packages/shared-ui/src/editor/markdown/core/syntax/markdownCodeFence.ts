export function serializeMarkdownCodeFence(infoString: string, code: string): string {
  const fenceCharacter = infoString.includes("`") ? "~" : "`";
  const fenceRuns = fenceCharacter === "`" ? /`+/g : /~+/g;
  const longestFence = Math.max(
    2,
    ...Array.from(code.matchAll(fenceRuns), (match) => match[0].length),
  );
  const fence = fenceCharacter.repeat(Math.max(3, longestFence + 1));
  const opening = infoString ? `${fence}${infoString}` : fence;
  return `${opening}\n${code}\n${fence}`;
}
