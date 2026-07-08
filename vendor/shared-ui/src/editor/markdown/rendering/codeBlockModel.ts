import type { EditorState } from "@codemirror/state";

export type MarkdownCodeBlock = {
  from: number;
  to: number;
  nextLineNumber: number;
  language: string;
  code: string;
};

export function getMarkdownCodeBlock(state: EditorState, lineNumber: number): MarkdownCodeBlock | null {
  const doc = state.doc;
  const openingLine = doc.line(lineNumber);
  const openingMatch = /^(\s*)(`{3,}|~{3,})([^\n`]*)$/.exec(openingLine.text);
  if (!openingMatch) return null;

  const fence = openingMatch[2];
  const fenceCharacter = fence[0];
  const minimumFenceLength = fence.length;
  const language = openingMatch[3].trim().split(/\s+/)[0] ?? "";
  const codeLines: string[] = [];
  let closingLine = openingLine;
  let nextLineNumber = lineNumber + 1;

  while (nextLineNumber <= doc.lines) {
    const line = doc.line(nextLineNumber);
    const closingPattern = new RegExp(`^\\s*\\${fenceCharacter}{${minimumFenceLength},}\\s*$`);
    if (closingPattern.test(line.text)) {
      closingLine = line;
      nextLineNumber += 1;
      break;
    }

    codeLines.push(line.text);
    closingLine = line;
    nextLineNumber += 1;
  }

  return {
    from: openingLine.from,
    to: closingLine.to,
    nextLineNumber,
    language,
    code: codeLines.join("\n"),
  };
}

export function isMermaidCodeBlockLanguage(language: string): boolean {
  const normalized = language.trim().toLowerCase();
  return normalized === "mermaid" || normalized === "mmd";
}

export function serializeMarkdownCodeBlock(language: string, code: string): string {
  const longestFence = Math.max(2, ...Array.from(code.matchAll(/`+/g), (match) => match[0].length));
  const fence = "`".repeat(Math.max(3, longestFence + 1));
  const info = language ? `${fence}${language}` : fence;
  return `${info}\n${code}\n${fence}`;
}

export function sanitizeCodeLanguage(value: string): string {
  return value.trim().replace(/\s+/g, "-").replace(/[`~]/g, "");
}
