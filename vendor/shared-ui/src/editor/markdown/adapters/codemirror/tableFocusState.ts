import { StateEffect, StateField, type EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { MarkdownTableFocusTarget } from "../../rendering/tableModel";

export type MarkdownTableFocusState = ({ tableFrom: number } & MarkdownTableFocusTarget) | null;

export const markdownTableFocusEffect = StateEffect.define<MarkdownTableFocusState>();

/**
 * Editor-scoped pending table focus. Replaces the previous module-global
 * pendingMarkdownTableFocus store (architecture §4.3 / Phase 5).
 */
export const markdownTableFocusField = StateField.define<MarkdownTableFocusState>({
  create() {
    return null;
  },
  update(value, transaction) {
    let next = value;
    for (const effect of transaction.effects) {
      if (effect.is(markdownTableFocusEffect)) next = effect.value;
    }
    if (next && transaction.docChanged) {
      const mappedFrom = transaction.changes.mapPos(next.tableFrom, 1);
      next = { ...next, tableFrom: mappedFrom };
    }
    return next;
  },
});

export function queuePendingMarkdownTableFocus(
  view: EditorView,
  tableFrom: number,
  focus: MarkdownTableFocusTarget,
) {
  view.dispatch({
    effects: markdownTableFocusEffect.of({ tableFrom, ...focus }),
  });
}

export function consumePendingMarkdownTableFocus(
  state: EditorState,
  tableFrom: number,
): MarkdownTableFocusTarget | null {
  const pending = state.field(markdownTableFocusField, false);
  if (!pending || pending.tableFrom !== tableFrom) return null;
  return {
    rowIndex: pending.rowIndex,
    columnIndex: pending.columnIndex,
  };
}

export function clearPendingMarkdownTableFocus(view: EditorView) {
  if (!view.state.field(markdownTableFocusField, false)) return;
  view.dispatch({ effects: markdownTableFocusEffect.of(null) });
}

export function focusMarkdownTableCell(wrapper: HTMLElement | null, target: MarkdownTableFocusTarget): boolean {
  const cell = wrapper?.querySelector<HTMLElement>(
    `.cm-md-table-cell-content[data-md-table-row="${target.rowIndex}"][data-md-table-column="${target.columnIndex}"]`,
  );
  if (!cell) return false;
  cell.focus({ preventScroll: true });
  placeCaretAtEnd(cell);
  return true;
}

export function restorePendingMarkdownTableFocus(wrapper: HTMLElement, view: EditorView, tableFrom: number) {
  const target = consumePendingMarkdownTableFocus(view.state, tableFrom);
  if (!target) return;
  clearPendingMarkdownTableFocus(view);
  const schedule = wrapper.ownerDocument.defaultView?.requestAnimationFrame.bind(wrapper.ownerDocument.defaultView);
  const restore = () => {
    if (!wrapper.isConnected) return;
    if (focusMarkdownTableCell(wrapper, target)) view.requestMeasure();
  };
  if (schedule) {
    schedule(restore);
  } else {
    setTimeout(restore, 0);
  }
}

function placeCaretAtEnd(element: HTMLElement) {
  const selection = element.ownerDocument.getSelection();
  if (!selection) return;
  const range = element.ownerDocument.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}
