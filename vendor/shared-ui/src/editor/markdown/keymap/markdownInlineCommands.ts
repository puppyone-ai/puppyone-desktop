import { EditorSelection, type EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export function toggleMarkdownInline(delimiter: "**" | "*" | "`" | "~~") {
  return (view: EditorView): boolean => {
    const { state } = view;
    if (state.readOnly || state.selection.ranges.length !== 1) return false;

    const selection = state.selection.main;
    const range = selection.empty ? getWordRangeAt(state, selection.from) : { from: selection.from, to: selection.to };
    if (!range || range.from === range.to) return false;

    const beforeFrom = Math.max(0, range.from - delimiter.length);
    const afterTo = Math.min(state.doc.length, range.to + delimiter.length);
    const before = state.sliceDoc(beforeFrom, range.from);
    const after = state.sliceDoc(range.to, afterTo);

    if (before === delimiter && after === delimiter) {
      view.dispatch({
        changes: [
          { from: range.to, to: afterTo, insert: "" },
          { from: beforeFrom, to: range.from, insert: "" },
        ],
        selection: EditorSelection.range(beforeFrom, range.to - delimiter.length),
      });
      return true;
    }

    view.dispatch({
      changes: [
        { from: range.to, insert: delimiter },
        { from: range.from, insert: delimiter },
      ],
      selection: EditorSelection.range(range.from + delimiter.length, range.to + delimiter.length),
    });
    return true;
  };
}

export function wrapMarkdownLink(view: EditorView): boolean {
  const { state } = view;
  if (state.readOnly || state.selection.ranges.length !== 1) return false;

  const selection = state.selection.main;
  const range = selection.empty ? getWordRangeAt(state, selection.from) : { from: selection.from, to: selection.to };
  if (!range || range.from === range.to) return false;

  const selectedText = state.sliceDoc(range.from, range.to);
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: `[${selectedText}]()` },
    selection: EditorSelection.cursor(range.from + selectedText.length + 3),
  });
  return true;
}

function getWordRangeAt(state: EditorState, pos: number): { from: number; to: number } | null {
  const line = state.doc.lineAt(pos);
  const offset = pos - line.from;
  const isWord = (char: string | undefined) => Boolean(char && /[\p{L}\p{N}_-]/u.test(char));
  let fromOffset = offset;
  let toOffset = offset;
  while (fromOffset > 0 && isWord(line.text[fromOffset - 1])) fromOffset -= 1;
  while (toOffset < line.text.length && isWord(line.text[toOffset])) toOffset += 1;
  if (fromOffset === toOffset) return null;
  return { from: line.from + fromOffset, to: line.from + toOffset };
}
