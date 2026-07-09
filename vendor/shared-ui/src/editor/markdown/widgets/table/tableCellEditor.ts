import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { MarkdownAssetUrlResolver, MarkdownLinkGraph } from "../../../viewerTypes";
import { renderMarkdownInlineInto } from "../../rendering/inlineRenderer";
import {
  sanitizeMarkdownTableCell,
  type MarkdownTableAlignment,
  type MarkdownTableCell,
  type MarkdownTableFocusTarget,
  type MarkdownTableRow,
  type MarkdownTableStructureOperation,
} from "../../rendering/tableModel";
import { isContentEditableCaretAtBoundary, stopCodeMirrorEvent } from "../widgetDom";
import {
  dispatchMarkdownTableStructureOperation,
  normalizeMarkdownTableCellInput,
  type MarkdownTableCellDraft,
} from "./tableDispatch";
import { showMarkdownTableContextMenu } from "./tableContextMenu";
import { focusMarkdownTableCell, queuePendingMarkdownTableFocus } from "./tableFocus";

export type MarkdownTableCellEditorContext = {
  alignments: readonly MarkdownTableAlignment[];
  cell: MarkdownTableCell;
  columnCount: number;
  columnIndex: number;
  documentPath: string;
  markdownAssetUrlResolver: MarkdownAssetUrlResolver | null;
  markdownLinkGraph: MarkdownLinkGraph | null;
  rowCount: number;
  rowIndex: number;
  rows: readonly MarkdownTableRow[];
  tableFrom: number;
  tableTo: number;
  view: EditorView;
};

export function createTableCellEditor(context: MarkdownTableCellEditorContext): HTMLElement {
  const {
    alignments,
    cell,
    columnCount,
    columnIndex,
    documentPath,
    markdownAssetUrlResolver,
    markdownLinkGraph,
    rowCount,
    rowIndex,
    rows,
    tableFrom,
    tableTo,
    view,
  } = context;
  const content = document.createElement("span");
  content.className = "cm-md-table-cell-content";
  content.dataset.mdTableCell = "true";
  content.dataset.mdTableColumn = String(columnIndex);
  content.dataset.mdTableRow = String(rowIndex);
  content.spellcheck = false;
  renderTableCellPreview(content, cell.text, markdownLinkGraph, documentPath, markdownAssetUrlResolver, () => {
    view.requestMeasure();
  });

  let editing = false;
  let suppressBlurCommit = false;

  const getDraft = (): MarkdownTableCellDraft => ({
    columnIndex,
    rowIndex,
    text: normalizeMarkdownTableCellInput(content.textContent ?? ""),
  });

  const commitCellEdit = (target: { exitPosition?: number; focus?: MarkdownTableFocusTarget }) => {
    const nextText = normalizeMarkdownTableCellInput(content.textContent ?? "");
    const changed = nextText !== cell.text;

    if (changed) {
      suppressBlurCommit = true;
      if (target.focus) queuePendingMarkdownTableFocus(tableFrom, target.focus);
      view.dispatch({
        changes: {
          from: cell.from,
          to: cell.to,
          insert: sanitizeMarkdownTableCell(nextText),
        },
        selection: EditorSelection.cursor(target.exitPosition ?? tableFrom),
      });
      if (target.exitPosition != null) view.focus();
      return;
    }

    if (target.focus) {
      focusMarkdownTableCell(content.closest<HTMLElement>(".cm-md-table-widget-wrap"), target.focus);
      return;
    }

    if (target.exitPosition != null) {
      view.dispatch({ selection: EditorSelection.cursor(target.exitPosition) });
      view.focus();
    }
  };

  const runStructureOperation = (operation: MarkdownTableStructureOperation) => {
    suppressBlurCommit = true;
    dispatchMarkdownTableStructureOperation({
      alignments,
      currentDraft: editing ? getDraft() : null,
      rows,
      tableFrom,
      tableTo,
      view,
    }, operation);
  };

  if (!view.state.readOnly && cell.editable) {
    content.contentEditable = "true";
    content.addEventListener("focus", () => {
      if (editing) return;
      editing = true;
      content.dataset.mdTableEditing = "true";
      content.textContent = cell.text;
      // Cell edit owns the chrome; drop the block selection so the table ring
      // and the cell ring never compete.
      const selection = view.state.selection.main;
      if (!selection.empty && selection.from <= tableFrom && selection.to >= tableTo) {
        view.dispatch({ selection: EditorSelection.cursor(tableFrom) });
      }
    });
    content.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "ArrowUp" && rowIndex === 0 && isContentEditableCaretAtBoundary(content, "start")) {
        event.preventDefault();
        commitCellEdit({ exitPosition: tableFrom });
        return;
      }
      if (event.key === "ArrowDown" && rowIndex === rowCount - 1 && isContentEditableCaretAtBoundary(content, "end")) {
        event.preventDefault();
        commitCellEdit({ exitPosition: tableTo });
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        const target = getAdjacentMarkdownTableCellTarget(rowIndex, columnIndex, rowCount, columnCount, event.shiftKey ? -1 : 1);
        if (target) {
          commitCellEdit({ focus: target });
          return;
        }
        if (event.shiftKey) {
          commitCellEdit({ exitPosition: tableFrom });
          return;
        }
        runStructureOperation({
          type: "insert-row-below",
          rowIndex,
          columnIndex,
        });
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        if (event.metaKey || event.ctrlKey) {
          runStructureOperation({
            type: "insert-row-below",
            rowIndex,
            columnIndex,
          });
          return;
        }
        if (rowIndex < rowCount - 1) {
          commitCellEdit({ focus: { rowIndex: rowIndex + 1, columnIndex } });
          return;
        }
        commitCellEdit({ exitPosition: tableTo });
      }
      if (event.key === "Escape") {
        event.preventDefault();
        content.textContent = cell.text;
        content.blur();
      }
    });
    content.addEventListener("blur", () => {
      if (suppressBlurCommit) {
        suppressBlurCommit = false;
        editing = false;
        delete content.dataset.mdTableEditing;
        return;
      }
      const nextText = normalizeMarkdownTableCellInput(content.textContent ?? "");
      editing = false;
      delete content.dataset.mdTableEditing;
      if (nextText === cell.text) {
        renderTableCellPreview(content, cell.text, markdownLinkGraph, documentPath, markdownAssetUrlResolver, () => {
          view.requestMeasure();
        });
        view.requestMeasure();
        return;
      }
      view.dispatch({
        changes: {
          from: cell.from,
          to: cell.to,
          insert: sanitizeMarkdownTableCell(nextText),
        },
      });
    });
  }

  if (!view.state.readOnly) {
    content.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      showMarkdownTableContextMenu({
        alignments,
        currentDraft: editing ? getDraft() : null,
        rows,
        tableFrom,
        tableTo,
        view,
      }, {
        clientX: event.clientX,
        clientY: event.clientY,
        columnCount,
        columnIndex,
        rowCount,
        rowIndex,
      });
    });
  }

  content.addEventListener("mousedown", stopCodeMirrorEvent);
  content.addEventListener("click", stopCodeMirrorEvent);
  content.addEventListener("input", stopCodeMirrorEvent);

  return content;
}

export function getAdjacentMarkdownTableCellTarget(
  rowIndex: number,
  columnIndex: number,
  rowCount: number,
  columnCount: number,
  direction: -1 | 1,
): MarkdownTableFocusTarget | null {
  const nextIndex = rowIndex * columnCount + columnIndex + direction;
  if (nextIndex < 0 || nextIndex >= rowCount * columnCount) return null;
  return {
    columnIndex: nextIndex % columnCount,
    rowIndex: Math.floor(nextIndex / columnCount),
  };
}

function renderTableCellPreview(
  content: HTMLElement,
  source: string,
  markdownLinkGraph: MarkdownLinkGraph | null,
  documentPath: string,
  markdownAssetUrlResolver: MarkdownAssetUrlResolver | null,
  onLayoutChange: () => void,
) {
  content.replaceChildren();
  renderMarkdownInlineInto(content, source, {
    markdownLinkGraph,
    markdownAssetUrlResolver,
    onLayoutChange,
    sourcePath: documentPath,
  });
}
