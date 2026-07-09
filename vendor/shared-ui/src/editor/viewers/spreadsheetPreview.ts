export const MAX_SPREADSHEET_SHEETS = 12;
export const MAX_SPREADSHEET_ROWS = 5_000;
export const MAX_SPREADSHEET_COLUMNS = 36;
export const MAX_SPREADSHEET_MATERIALIZED_CELLS = 200_000;
export const MAX_SPREADSHEET_STRING_PAYLOAD_BYTES = 12 * 1024 * 1024;

export type SpreadsheetArchiveKind = "none" | "ooxml" | "ods";

export type SpreadsheetBudgetTruncationReason =
  | "materialized-cell-limit"
  | "string-payload-limit";

export type SpreadsheetBudgetUsage = {
  /** Row cell values plus merge payload records included in the normalized result. */
  materializedCells: number;
  /** Conservative UTF-16 byte charge for sheet names, displayed values, and formulas. */
  stringPayloadBytes: number;
  truncated: boolean;
  truncationReasons: SpreadsheetBudgetTruncationReason[];
};

export function getSpreadsheetArchiveKind(extension: string): SpreadsheetArchiveKind {
  const normalized = extension.toLowerCase().replace(/^\./, "");
  if (normalized === "xlsx" || normalized === "xlsm" || normalized === "xlsb") return "ooxml";
  if (normalized === "ods" || normalized === "ots") return "ods";
  return "none";
}

export type SpreadsheetPreviewResult = {
  kind: "spreadsheet";
  sheets: SpreadsheetSheet[];
  totalVisibleSheets: number;
  hiddenSheetCount: number;
  truncatedSheetCount: number;
  budget: SpreadsheetBudgetUsage;
};

export type SpreadsheetSheet = {
  name: string;
  rows: SpreadsheetSourceRow[];
  columns: SpreadsheetColumn[];
  merges: SpreadsheetMerge[];
  totalRows: number;
  totalColumns: number;
  totalVisibleRows: number;
  totalVisibleColumns: number;
  hiddenRowCount: number;
  hiddenColumnCount: number;
  truncatedRows: boolean;
  truncatedColumns: boolean;
  budget: SpreadsheetBudgetUsage;
};

export type SpreadsheetSourceRow = {
  rowIndex: number;
  values: string[];
};

export type SpreadsheetColumn = {
  columnIndex: number;
  width: number;
};

export type SpreadsheetMerge = {
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
  value: string;
};

export type SpreadsheetRenderRow = {
  rowIndex: number;
  cells: SpreadsheetRenderCell[];
};

export type SpreadsheetRenderCell = {
  columnIndex: number;
  value: string;
  colSpan: number;
  rowSpan: number;
};

type WindowMergeCell = {
  merge: SpreadsheetMerge;
  isAnchor: boolean;
  rowSpan: number;
  colSpan: number;
};

/**
 * Materialize only the requested visible row window. Merges that begin above
 * the window are re-anchored at its first row, so their value and column
 * geometry remain visible without mounting every row back to the true anchor.
 */
export function getSpreadsheetRenderRows(
  sheet: SpreadsheetSheet,
  startRow: number,
  endRow: number,
): SpreadsheetRenderRow[] {
  const clampedStart = Math.max(0, Math.min(startRow, sheet.rows.length));
  const clampedEnd = Math.max(clampedStart, Math.min(endRow, sheet.rows.length));
  const mergeCells = createWindowMergeCells(sheet.merges, clampedStart, clampedEnd);

  return sheet.rows.slice(clampedStart, clampedEnd).map((row, offset) => {
    const rowPosition = clampedStart + offset;
    const cells: SpreadsheetRenderCell[] = [];

    for (let columnPosition = 0; columnPosition < sheet.columns.length; columnPosition += 1) {
      const mergeCell = mergeCells.get(cellPositionKey(rowPosition, columnPosition));
      if (mergeCell && !mergeCell.isAnchor) continue;

      const column = sheet.columns[columnPosition];
      cells.push({
        columnIndex: column.columnIndex,
        value: mergeCell?.merge.value ?? row.values[columnPosition] ?? "",
        colSpan: mergeCell?.colSpan ?? 1,
        rowSpan: mergeCell?.rowSpan ?? 1,
      });
    }

    return { rowIndex: row.rowIndex, cells };
  });
}

function createWindowMergeCells(
  merges: SpreadsheetMerge[],
  startRow: number,
  endRow: number,
): Map<string, WindowMergeCell> {
  const cells = new Map<string, WindowMergeCell>();
  if (startRow >= endRow) return cells;

  for (const merge of merges) {
    const intersectionStartRow = Math.max(startRow, merge.startRow);
    const intersectionEndRow = Math.min(endRow - 1, merge.endRow);
    if (intersectionStartRow > intersectionEndRow) continue;

    const anchorRow = intersectionStartRow;
    const rowSpan = intersectionEndRow - intersectionStartRow + 1;
    const colSpan = merge.endColumn - merge.startColumn + 1;

    for (let row = intersectionStartRow; row <= intersectionEndRow; row += 1) {
      for (let column = merge.startColumn; column <= merge.endColumn; column += 1) {
        const key = cellPositionKey(row, column);
        if (cells.has(key)) continue;
        cells.set(key, {
          merge,
          isAnchor: row === anchorRow && column === merge.startColumn,
          rowSpan,
          colSpan,
        });
      }
    }
  }

  return cells;
}

function cellPositionKey(row: number, column: number): string {
  return `${row}:${column}`;
}
