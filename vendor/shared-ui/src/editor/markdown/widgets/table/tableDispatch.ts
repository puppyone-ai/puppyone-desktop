import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import {
  applyMarkdownTableOperation,
  type MarkdownTableAlignment,
  type MarkdownTableRow,
  type MarkdownTableStructureOperation,
} from "../../rendering/tableModel";
import { normalizeLineEndings } from "../widgetDom";
import { queuePendingMarkdownTableFocus } from "./tableFocus";
import { closeActiveMarkdownTableMenu } from "./tableMenuState";

export type MarkdownTableDispatchContext = {
  alignments: readonly MarkdownTableAlignment[];
  currentDraft?: MarkdownTableCellDraft | null;
  rows: readonly MarkdownTableRow[];
  tableFrom: number;
  tableTo: number;
  view: EditorView;
};

export type MarkdownTableCellDraft = {
  columnIndex: number;
  rowIndex: number;
  text: string;
};

export function dispatchMarkdownTableStructureOperation(
  context: MarkdownTableDispatchContext,
  operation: MarkdownTableStructureOperation,
) {
  closeActiveMarkdownTableMenu();
  const result = applyMarkdownTableOperation({
    alignments: context.alignments,
    rows: getMarkdownTableRowsWithDraft(context.rows, context.currentDraft),
  }, operation);

  if (result.focus) {
    queuePendingMarkdownTableFocus(context.view, context.tableFrom, result.focus);
  }
  context.view.dispatch({
    changes: {
      from: context.tableFrom,
      to: context.tableTo,
      insert: result.replacement,
    },
    selection: EditorSelection.cursor(context.tableFrom),
  });
  if (!result.focus) context.view.focus();
}

function getMarkdownTableRowsWithDraft(
  rows: readonly MarkdownTableRow[],
  draft: MarkdownTableCellDraft | null | undefined,
): string[][] {
  const nextRows = rows.map((row) => row.cells.map((cell) => cell.text));
  if (draft && nextRows[draft.rowIndex]?.[draft.columnIndex] != null) {
    nextRows[draft.rowIndex][draft.columnIndex] = draft.text;
  }
  return nextRows;
}

export function getActiveMarkdownTableCellDraft(wrapper: HTMLElement): MarkdownTableCellDraft | null {
  const activeElement = wrapper.ownerDocument.activeElement;
  if (!(activeElement instanceof HTMLElement)) return null;
  const cell = activeElement.closest<HTMLElement>(".cm-md-table-cell-content[data-md-table-editing='true']");
  if (!cell || !wrapper.contains(cell)) return null;
  return getMarkdownTableCellDraft(cell);
}

function getMarkdownTableCellDraft(cell: HTMLElement): MarkdownTableCellDraft | null {
  const rowIndex = Number.parseInt(cell.dataset.mdTableRow ?? "", 10);
  const columnIndex = Number.parseInt(cell.dataset.mdTableColumn ?? "", 10);
  if (!Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)) return null;
  return {
    columnIndex,
    rowIndex,
    text: normalizeMarkdownTableCellInput(cell.textContent ?? ""),
  };
}

export function normalizeMarkdownTableCellInput(value: string): string {
  return normalizeLineEndings(value).replace(/\n+/g, " ").trim();
}
