import { EditorSelection, EditorState, type ChangeSpec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export function setMarkdownHeadingLevel(level: 0 | 1 | 2 | 3 | 4 | 5 | 6) {
  return (view: EditorView): boolean => {
    const { state } = view;
    if (state.readOnly) return false;

    const changes: ChangeSpec[] = [];
    const touchedLines = new Set<number>();
    const marker = level > 0 ? `${"#".repeat(level)} ` : "";

    for (const range of state.selection.ranges) {
      const fromLine = state.doc.lineAt(range.from);
      const toLine = state.doc.lineAt(range.to);
      for (let lineNumber = fromLine.number; lineNumber <= toLine.number; lineNumber += 1) {
        if (touchedLines.has(lineNumber)) continue;
        touchedLines.add(lineNumber);

        const line = state.doc.line(lineNumber);
        const headingMatch = /^(#{1,6})(\s|$)/.exec(line.text);
        const replaceTo = line.from + (headingMatch?.[0].length ?? 0);
        if (state.sliceDoc(line.from, replaceTo) === marker) continue;
        changes.push({ from: line.from, to: replaceTo, insert: marker });
      }
    }

    if (changes.length > 0) view.dispatch({ changes });
    return true;
  };
}

export function toggleMarkdownList(kind: "bullet" | "ordered" | "task") {
  return (view: EditorView): boolean => {
    const { state } = view;
    if (state.readOnly) return false;

    const lines = getSelectedLineNumbers(state);
    const allMatching = lines.every((lineNumber) => {
      const text = state.doc.line(lineNumber).text;
      if (kind === "task") return /^\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\]\s+/.test(text);
      if (kind === "ordered") return /^\s*\d+[.)]\s+/.test(text);
      return /^\s*[-*+]\s+/.test(text) && !/^\s*[-*+]\s+\[[ xX]\]\s+/.test(text);
    });

    const changes: ChangeSpec[] = [];
    lines.forEach((lineNumber, index) => {
      const line = state.doc.line(lineNumber);
      const leadingWhitespace = /^\s*/.exec(line.text)?.[0] ?? "";
      const markerMatch = /^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s*)?/.exec(line.text);
      const markerTo = markerMatch ? line.from + markerMatch[0].length : line.from + leadingWhitespace.length;
      const markerFrom = line.from + leadingWhitespace.length;

      if (allMatching) {
        if (markerMatch) changes.push({ from: markerFrom, to: markerTo, insert: "" });
        return;
      }

      const marker = kind === "ordered" ? `${index + 1}. ` : kind === "task" ? "- [ ] " : "- ";
      changes.push({ from: markerFrom, to: markerTo, insert: marker });
    });

    if (changes.length === 0) return false;
    view.dispatch({ changes });
    if (kind === "ordered") renumberOrderedLists(view);
    return true;
  };
}

export function toggleMarkdownQuote(view: EditorView): boolean {
  const { state } = view;
  if (state.readOnly) return false;

  const lines = getSelectedLineNumbers(state);
  const allQuoted = lines.every((lineNumber) => /^\s*>\s?/.test(state.doc.line(lineNumber).text));
  const changes: ChangeSpec[] = [];

  for (const lineNumber of lines) {
    const line = state.doc.line(lineNumber);
    const leadingWhitespace = /^\s*/.exec(line.text)?.[0] ?? "";
    if (allQuoted) {
      const quoteMatch = /^(\s*)>\s?/.exec(line.text);
      if (quoteMatch) changes.push({ from: line.from + quoteMatch[1].length, to: line.from + quoteMatch[0].length, insert: "" });
      continue;
    }
    changes.push({ from: line.from + leadingWhitespace.length, insert: "> " });
  }

  if (changes.length === 0) return false;
  view.dispatch({ changes });
  return true;
}

export function indentMarkdownListItem(view: EditorView): boolean {
  return adjustMarkdownListIndent(view, 1);
}

export function outdentMarkdownListItem(view: EditorView): boolean {
  return adjustMarkdownListIndent(view, -1);
}

function adjustMarkdownListIndent(view: EditorView, direction: 1 | -1): boolean {
  const { state } = view;
  if (state.readOnly) return false;

  const changes: ChangeSpec[] = [];
  const touchedLines = getSelectedLineNumbers(state);
  for (const lineNumber of touchedLines) {
    const line = state.doc.line(lineNumber);
    if (!/^\s*(?:[-*+]|\d+[.)])\s+/.test(line.text)) continue;
    if (direction > 0) {
      changes.push({ from: line.from, to: line.from, insert: "  " });
      continue;
    }

    const outdentWidth = line.text.startsWith("  ") ? 2 : line.text.startsWith("\t") ? 1 : 0;
    if (outdentWidth > 0) changes.push({ from: line.from, to: line.from + outdentWidth, insert: "" });
  }

  if (changes.length === 0) return false;
  view.dispatch({ changes });
  renumberOrderedLists(view);
  return true;
}

export function getSelectedLineNumbers(state: EditorState): number[] {
  const lines = new Set<number>();
  for (const range of state.selection.ranges) {
    const fromLine = state.doc.lineAt(range.from);
    const toLine = state.doc.lineAt(range.to);
    for (let lineNumber = fromLine.number; lineNumber <= toLine.number; lineNumber += 1) {
      lines.add(lineNumber);
    }
  }
  return [...lines].sort((left, right) => left - right);
}

export function getContinuationPrefix(text: string): string | null {
  const taskMatch = /^(\s*)([-*+]|\d+[.)])\s+\[[ xX]\]\s+/.exec(text);
  if (taskMatch) return `${taskMatch[1]}${getNextListMarker(taskMatch[2])} [ ] `;

  const listMatch = /^(\s*)([-*+]|\d+[.)])\s+/.exec(text);
  if (listMatch) return `${listMatch[1]}${getNextListMarker(listMatch[2])} `;

  const quoteMatch = /^(\s*>+\s?)/.exec(text);
  if (quoteMatch) return quoteMatch[1].endsWith(" ") ? quoteMatch[1] : `${quoteMatch[1]} `;

  return null;
}

export function getListOrQuoteContent(text: string): string {
  return text
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s*)?/, "")
    .replace(/^\s*>+\s?/, "");
}

export function getLineMarkerPrefixRange(lineFrom: number, text: string): { from: number; to: number } | null {
  const match = /^(\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s*)?|\s*>+\s?)/.exec(text);
  if (!match) return null;
  return { from: lineFrom, to: lineFrom + match[0].length };
}

function getNextListMarker(marker: string): string {
  const orderedMatch = /^(\d+)([.)])$/.exec(marker);
  if (!orderedMatch) return marker;
  return `${Number.parseInt(orderedMatch[1], 10) + 1}${orderedMatch[2]}`;
}

export type OrderedListRenumberScope = Readonly<{
  from: number;
  to: number;
  indent?: string;
}>;

export function getOrderedListRenumberChanges(
  state: EditorState,
  scope?: OrderedListRenumberScope,
): ChangeSpec[] {
  const changes: ChangeSpec[] = [];
  const countersByIndent = new Map<string, number>();
  const firstLine = scope ? state.doc.lineAt(scope.from).number : 1;
  const lastLine = scope ? state.doc.lineAt(scope.to).number : state.doc.lines;

  for (let lineNumber = firstLine; lineNumber <= lastLine; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    const match = /^(\s*)(\d+)([.)])\s+/.exec(line.text);
    if (!match) {
      if (!scope && !/^\s*(?:[-*+]|\d+[.)])\s+/.test(line.text)) countersByIndent.clear();
      continue;
    }
    if (scope?.indent !== undefined && match[1] !== scope.indent) continue;

    const indentKey = match[1].replace(/\t/g, "  ");
    const nextNumber = (countersByIndent.get(indentKey) ?? 0) + 1;
    countersByIndent.set(indentKey, nextNumber);
    if (match[2] === String(nextNumber)) continue;

    const markerFrom = line.from + match[1].length;
    changes.push({ from: markerFrom, to: markerFrom + match[2].length, insert: String(nextNumber) });
  }

  return changes;
}

export function renumberOrderedLists(view: EditorView) {
  const changes = getOrderedListRenumberChanges(view.state);
  if (changes.length > 0) view.dispatch({ changes });
}
