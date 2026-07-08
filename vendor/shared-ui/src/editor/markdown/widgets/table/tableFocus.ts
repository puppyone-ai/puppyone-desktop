import type { EditorView } from "@codemirror/view";
import type { MarkdownTableFocusTarget } from "../../rendering/tableModel";

/**
 * Structural edits replace the whole table block, which destroys and recreates
 * the widget DOM. The pending focus target survives that rebuild so the caret
 * lands in the logical cell of the new widget.
 */
let pendingMarkdownTableFocus: ({ tableFrom: number } & MarkdownTableFocusTarget) | null = null;

export function queuePendingMarkdownTableFocus(tableFrom: number, focus: MarkdownTableFocusTarget) {
  pendingMarkdownTableFocus = {
    tableFrom,
    ...focus,
  };
}

export function restorePendingMarkdownTableFocus(wrapper: HTMLElement, view: EditorView, tableFrom: number) {
  if (!pendingMarkdownTableFocus || pendingMarkdownTableFocus.tableFrom !== tableFrom) return;
  const target = pendingMarkdownTableFocus;
  pendingMarkdownTableFocus = null;
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

export function focusMarkdownTableCell(wrapper: HTMLElement | null, target: MarkdownTableFocusTarget): boolean {
  const cell = wrapper?.querySelector<HTMLElement>(
    `.cm-md-table-cell-content[data-md-table-row="${target.rowIndex}"][data-md-table-column="${target.columnIndex}"]`,
  );
  if (!cell) return false;
  cell.focus({ preventScroll: true });
  placeCaretAtEnd(cell);
  return true;
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
