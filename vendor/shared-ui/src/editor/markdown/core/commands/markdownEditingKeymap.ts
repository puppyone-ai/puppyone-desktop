import { EditorSelection } from "@codemirror/state";
import { EditorView, type KeyBinding } from "@codemirror/view";
import {
  getCollapsedMarkerDeletionUnit,
  getExpandableInlineAtomAtSelection,
} from "../plans/markdownPlanIndex";
import { markdownExpandedImageEffect } from "../state/expandedImage";
import { isSelectionInComposingBlockLine, markdownComposingBlockLineField } from "../state/composingBlockLine";
import {
  getBlockMarkerAtVisibleStart,
  getMarkdownVisibleLineStart as getMarkdownVisibleLineStartPosition,
} from "../syntax/markdownElements";
import {
  getContinuationPrefix,
  getLineMarkerPrefixRange,
  getListOrQuoteContent,
  indentMarkdownListItem,
  outdentMarkdownListItem,
  renumberOrderedLists,
  setMarkdownHeadingLevel,
  toggleMarkdownList,
  toggleMarkdownQuote,
} from "./markdownBlockCommands";
import { toggleMarkdownInline, wrapMarkdownLink } from "./markdownInlineCommands";

export const markdownEditingKeymap: readonly KeyBinding[] = [
  { key: "Backspace", run: deleteMarkdownMarkerBackward },
  { key: "Delete", run: deleteMarkdownMarkerForward },
  { key: "Enter", run: handleMarkdownEnter },
  { key: "ArrowLeft", run: moveMarkdownCaretLeftAcrossHiddenBlockMarker },
  { key: "Home", run: moveMarkdownCaretToVisibleLineStart },
  { key: "Mod-ArrowLeft", run: moveMarkdownCaretToVisibleLineStart },
  { key: "Tab", run: indentMarkdownListItem },
  { key: "Shift-Tab", run: outdentMarkdownListItem },
  { key: "Mod-0", run: setMarkdownHeadingLevel(0), preventDefault: true },
  { key: "Mod-1", run: setMarkdownHeadingLevel(1), preventDefault: true },
  { key: "Mod-2", run: setMarkdownHeadingLevel(2), preventDefault: true },
  { key: "Mod-3", run: setMarkdownHeadingLevel(3), preventDefault: true },
  { key: "Mod-4", run: setMarkdownHeadingLevel(4), preventDefault: true },
  { key: "Mod-5", run: setMarkdownHeadingLevel(5), preventDefault: true },
  { key: "Mod-6", run: setMarkdownHeadingLevel(6), preventDefault: true },
  { key: "Mod-Shift-7", run: toggleMarkdownList("ordered"), preventDefault: true },
  { key: "Mod-Shift-8", run: toggleMarkdownList("bullet"), preventDefault: true },
  { key: "Mod-Shift-9", run: toggleMarkdownList("task"), preventDefault: true },
  { key: "Mod-Shift-.", run: toggleMarkdownQuote, preventDefault: true },
  { key: "Mod-b", run: toggleMarkdownInline("**"), preventDefault: true },
  { key: "Mod-i", run: toggleMarkdownInline("*"), preventDefault: true },
  { key: "Mod-e", run: toggleMarkdownInline("`"), preventDefault: true },
  { key: "Mod-Shift-x", run: toggleMarkdownInline("~~"), preventDefault: true },
  { key: "Mod-k", run: wrapMarkdownLink, preventDefault: true },
];

function moveMarkdownCaretLeftAcrossHiddenBlockMarker(view: EditorView): boolean {
  const { state } = view;
  if (state.selection.ranges.length !== 1) return false;

  const selection = state.selection.main;
  if (!selection.empty) return false;

  const line = state.doc.lineAt(selection.from);
  const composingLine = state.field(markdownComposingBlockLineField, false);
  if (composingLine?.from === line.from) return false;

  const visibleStart = getMarkdownVisibleLineStartPosition(state, line.from);
  if (visibleStart == null || selection.from !== visibleStart || line.from === 0) return false;

  view.dispatch({ selection: EditorSelection.cursor(line.from - 1) });
  return true;
}

function deleteMarkdownMarkerBackward(view: EditorView): boolean {
  const { state } = view;
  if (state.readOnly || state.selection.ranges.length !== 1) return false;

  const selection = state.selection.main;
  if (!selection.empty) return false;
  if (isSelectionInComposingBlockLine(state, selection.from)) return false;

  const deletion =
    getBlockMarkerAtVisibleStart(state, selection.from) ??
    getCollapsedMarkerDeletionUnit(state, selection.from, "backward");
  if (!deletion) return false;

  view.dispatch({
    changes: deletion,
    selection: EditorSelection.cursor(deletion.from),
  });
  return true;
}

function deleteMarkdownMarkerForward(view: EditorView): boolean {
  const { state } = view;
  if (state.readOnly || state.selection.ranges.length !== 1) return false;

  const selection = state.selection.main;
  if (!selection.empty) return false;
  if (isSelectionInComposingBlockLine(state, selection.from)) return false;

  const deletion = getCollapsedMarkerDeletionUnit(state, selection.from, "forward");
  if (!deletion) return false;

  view.dispatch({
    changes: deletion,
    selection: EditorSelection.cursor(deletion.from),
  });
  return true;
}

function handleMarkdownEnter(view: EditorView): boolean {
  const { state } = view;
  if (state.readOnly || state.selection.ranges.length !== 1) return false;
  if (expandSelectedInlineAtom(view)) return true;

  const selection = state.selection.main;
  if (!selection.empty) return false;

  const line = state.doc.lineAt(selection.from);
  const prefix = getContinuationPrefix(line.text);
  if (!prefix) return false;

  const content = getListOrQuoteContent(line.text);
  if (selection.from === line.to && content.trim() === "") {
    const marker = getLineMarkerPrefixRange(line.from, line.text);
    if (!marker) return false;
    view.dispatch({
      changes: { from: marker.from, to: marker.to, insert: "" },
      selection: EditorSelection.cursor(marker.from),
    });
    return true;
  }

  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: `\n${prefix}` },
    selection: EditorSelection.cursor(selection.from + 1 + prefix.length),
  });
  renumberOrderedLists(view);
  return true;
}

function expandSelectedInlineAtom(view: EditorView): boolean {
  const selection = view.state.selection.main;
  if (selection.empty) return false;

  const entry = getExpandableInlineAtomAtSelection(view.state, selection.from, selection.to);
  if (!entry || entry.plan.presentation !== "inlineAtom") return false;

  if (entry.plan.atom.kind === "image") {
    view.dispatch({
      effects: markdownExpandedImageEffect.of({
        from: entry.plan.sourceRange.from,
        to: entry.plan.sourceRange.to,
      }),
      selection: EditorSelection.cursor(entry.plan.sourceRange.from + 2),
    });
    return true;
  }

  if (entry.plan.atom.kind === "lineBreak") {
    // Explicit expansion: place the caret inside the revealed source tag.
    view.dispatch({
      selection: EditorSelection.cursor(entry.plan.sourceRange.from + 1),
    });
    return true;
  }

  return false;
}

function moveMarkdownCaretToVisibleLineStart(view: EditorView): boolean {
  const { state } = view;
  if (state.selection.ranges.length !== 1) return false;

  const selection = state.selection.main;
  if (!selection.empty) return false;

  const line = state.doc.lineAt(selection.from);
  const visibleStart = getMarkdownVisibleLineStartPosition(state, line.from);
  if (visibleStart == null || selection.from === visibleStart) return false;

  view.dispatch({ selection: EditorSelection.cursor(visibleStart) });
  return true;
}
