import type { EditorState, Transaction } from "@codemirror/state";
import type { InlineRevealRange } from "../decorations/decorationPrimitives";
import { getInlineRevealElement } from "../syntax/markdownElements";

/**
 * Resolve the source fragment revealed by one Markdown EditorView.
 *
 * The reveal is deliberately sticky while focus moves to a sibling pane. A
 * pane owns its projection just as it owns selection and scroll; blur must not
 * rebuild its line boxes or make another pane's interaction change its DOM.
 * The range is recalculated only when this view is actively entered or its
 * own selection/document changes.
 */
export function resolvePaneLocalInlineRevealRange(
  previousRange: InlineRevealRange | null,
  previouslyFocused: boolean,
  transaction: Transaction,
  focused: boolean,
): InlineRevealRange | null {
  const mappedPreviousRange = mapInlineRevealRange(previousRange, transaction);
  if (!focused) {
    if (!mappedPreviousRange || (!transaction.docChanged && !transaction.reconfigured)) {
      return mappedPreviousRange;
    }
    return isInlineRevealRangeValid(transaction.state, mappedPreviousRange)
      ? mappedPreviousRange
      : null;
  }

  const enteredPane = !previouslyFocused;
  const selectionChanged = !transaction.startState.selection.eq(transaction.state.selection);
  if (
    !enteredPane
    && !selectionChanged
    && !transaction.docChanged
    && !transaction.reconfigured
  ) {
    return mappedPreviousRange;
  }

  return getInlineRevealRangeAtSelection(transaction.state);
}

function mapInlineRevealRange(
  range: InlineRevealRange | null,
  transaction: Transaction,
): InlineRevealRange | null {
  if (!range) return null;
  return {
    from: transaction.changes.mapPos(range.from, -1),
    to: transaction.changes.mapPos(range.to, 1),
  };
}

function getInlineRevealRangeAtSelection(state: EditorState): InlineRevealRange | null {
  if (state.readOnly || state.selection.ranges.length !== 1) return null;
  const selection = state.selection.main;
  if (!selection.empty) return null;
  const element = getInlineRevealElement(state, selection.from);
  return element ? { from: element.from, to: element.to } : null;
}

function isInlineRevealRangeValid(
  state: EditorState,
  range: InlineRevealRange,
): boolean {
  if (range.from < 0 || range.to > state.doc.length || range.to - range.from < 2) return false;
  const probe = Math.min(range.to - 1, range.from + 1);
  const element = getInlineRevealElement(state, probe);
  return element?.from === range.from && element.to === range.to;
}
