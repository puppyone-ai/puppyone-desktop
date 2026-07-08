import type { EditorState } from "@codemirror/state";

export type MarkdownTableAlignment = "left" | "center" | "right" | null;

export type MarkdownTableBlock = {
  from: number;
  to: number;
  nextLineNumber: number;
  alignments: MarkdownTableAlignment[];
  rows: MarkdownTableRow[];
};

export type MarkdownTableCell = {
  text: string;
  from: number;
  to: number;
  editable: boolean;
};

export type MarkdownTableRow = {
  cells: MarkdownTableCell[];
  header: boolean;
  lineTo: number;
};

export type MarkdownTableFocusTarget = {
  rowIndex: number;
  columnIndex: number;
};

export type MarkdownTableStructureOperation =
  | { type: "insert-row-above"; rowIndex: number; columnIndex: number }
  | { type: "insert-row-below"; rowIndex: number; columnIndex: number }
  | { type: "delete-row"; rowIndex: number; columnIndex: number }
  | { type: "move-row-up"; rowIndex: number; columnIndex: number }
  | { type: "move-row-down"; rowIndex: number; columnIndex: number }
  | { type: "move-row-to"; rowIndex: number; columnIndex: number; targetRowIndex: number }
  | { type: "duplicate-row"; rowIndex: number; columnIndex: number }
  | { type: "insert-column-left"; rowIndex: number; columnIndex: number }
  | { type: "insert-column-right"; rowIndex: number; columnIndex: number }
  | { type: "delete-column"; rowIndex: number; columnIndex: number }
  | { type: "move-column-left"; rowIndex: number; columnIndex: number }
  | { type: "move-column-right"; rowIndex: number; columnIndex: number }
  | { type: "move-column-to"; rowIndex: number; columnIndex: number; targetColumnIndex: number }
  | { type: "set-column-alignment"; rowIndex: number; columnIndex: number; alignment: MarkdownTableAlignment }
  | { type: "delete-table"; rowIndex: number; columnIndex: number };

export type MarkdownTableOperationResult = {
  replacement: string;
  focus: MarkdownTableFocusTarget | null;
};

type MarkdownSourceLine = {
  from: number;
  text: string;
};

type TableCellSegment = {
  rawFrom: number;
  rawTo: number;
  text: string;
};

type MarkdownTableSerializableRow = MarkdownTableRow | string[];

type MarkdownTableSerializable = {
  alignments?: readonly MarkdownTableAlignment[];
  rows: readonly MarkdownTableSerializableRow[];
};

export function getMarkdownTableBlock(state: EditorState, lineNumber: number): MarkdownTableBlock | null {
  const doc = state.doc;
  if (lineNumber >= doc.lines) return null;

  const headerLine = doc.line(lineNumber);
  const delimiterLine = doc.line(lineNumber + 1);
  if (!isTableHeaderLine(headerLine.text) || !isTableDelimiterLine(delimiterLine.text)) return null;

  const delimiterCells = splitTableCells(delimiterLine.text);
  const rows: MarkdownTableRow[] = [{
    cells: splitTableCellsWithPositions(headerLine),
    header: true,
    lineTo: headerLine.to,
  }];
  let lastLine = delimiterLine;
  let nextLineNumber = lineNumber + 2;

  while (nextLineNumber <= doc.lines) {
    const rowLine = doc.line(nextLineNumber);
    if (!isMarkdownTableLine(rowLine.text) || isTableDelimiterLine(rowLine.text)) break;
    rows.push({
      cells: splitTableCellsWithPositions(rowLine),
      header: false,
      lineTo: rowLine.to,
    });
    lastLine = rowLine;
    nextLineNumber += 1;
  }

  const width = Math.max(delimiterCells.length, ...rows.map((row) => row.cells.length));

  return {
    from: headerLine.from,
    to: lastLine.to,
    alignments: normalizeTableAlignments(delimiterCells.map(parseTableAlignment), width),
    nextLineNumber,
    rows: normalizeTableRows(rows, width),
  };
}

export function isMarkdownTableLine(text: string): boolean {
  const trimmed = text.trim();
  if (!hasUnescapedPipe(trimmed)) return false;
  if (isTableDelimiterLine(trimmed)) return true;
  return splitTableCells(trimmed).length > 0;
}

export function isMarkdownTableSourceLine(text: string): boolean {
  const trimmed = text.trim();
  if (!hasUnescapedPipe(trimmed)) return false;
  if (isTableDelimiterLine(trimmed)) return true;
  return /^\|.+\|$/.test(trimmed);
}

export function serializeMarkdownTable(table: MarkdownTableSerializable): string {
  const rows = normalizeTableTextRows(table.rows);
  const width = Math.max(1, table.alignments?.length ?? 0, ...rows.map((row) => row.length));
  const normalizedRows = rows.map((row) => normalizeTextRow(row, width));
  const alignments = normalizeTableAlignments(table.alignments ?? [], width);
  const delimiterCells = alignments.map((alignment) => createDelimiterCell(alignment));
  const columnWidths = Array.from({ length: width }, (_, columnIndex) => {
    const cellWidth = Math.max(...normalizedRows.map((row) => row[columnIndex].length));
    return Math.max(cellWidth, delimiterCells[columnIndex].length);
  });

  const lines = [
    serializeMarkdownTableRow(normalizedRows[0] ?? createEmptyTextRow(width), columnWidths),
    serializeMarkdownTableRow(delimiterCells, columnWidths),
  ];

  for (const row of normalizedRows.slice(1)) {
    lines.push(serializeMarkdownTableRow(row, columnWidths));
  }

  return lines.join("\n");
}

export function applyMarkdownTableOperation(
  table: MarkdownTableSerializable,
  operation: MarkdownTableStructureOperation,
): MarkdownTableOperationResult {
  if (operation.type === "delete-table") {
    return { replacement: "", focus: null };
  }

  const matrix = normalizeTableTextRows(table.rows);
  const width = Math.max(1, table.alignments?.length ?? 0, ...matrix.map((row) => row.length));
  const rows = matrix.length > 0
    ? matrix.map((row) => normalizeTextRow(row, width))
    : [createEmptyTextRow(width)];
  const alignments = normalizeTableAlignments(table.alignments ?? [], width);
  const rowIndex = clampInteger(operation.rowIndex, 0, rows.length - 1);
  const columnIndex = clampInteger(operation.columnIndex, 0, width - 1);
  let focus: MarkdownTableFocusTarget = { rowIndex, columnIndex };

  switch (operation.type) {
    case "insert-row-above": {
      const insertIndex = rowIndex <= 0 ? 1 : rowIndex;
      rows.splice(insertIndex, 0, createEmptyTextRow(width));
      focus = { rowIndex: insertIndex, columnIndex: 0 };
      break;
    }
    case "insert-row-below": {
      const insertIndex = Math.max(1, rowIndex + 1);
      rows.splice(insertIndex, 0, createEmptyTextRow(width));
      focus = { rowIndex: insertIndex, columnIndex: 0 };
      break;
    }
    case "delete-row": {
      if (rowIndex > 0 && rows.length > 1) {
        rows.splice(rowIndex, 1);
        focus = {
          rowIndex: Math.min(rowIndex, rows.length - 1),
          columnIndex,
        };
      }
      break;
    }
    case "move-row-up": {
      if (rowIndex > 1) {
        swapArrayItems(rows, rowIndex, rowIndex - 1);
        focus = { rowIndex: rowIndex - 1, columnIndex };
      }
      break;
    }
    case "move-row-down": {
      if (rowIndex > 0 && rowIndex < rows.length - 1) {
        swapArrayItems(rows, rowIndex, rowIndex + 1);
        focus = { rowIndex: rowIndex + 1, columnIndex };
      }
      break;
    }
    case "move-row-to": {
      const targetRowIndex = clampInteger(operation.targetRowIndex, 1, rows.length - 1);
      if (rowIndex > 0 && rowIndex !== targetRowIndex) {
        moveArrayItem(rows, rowIndex, targetRowIndex);
        focus = { rowIndex: targetRowIndex, columnIndex };
      }
      break;
    }
    case "duplicate-row": {
      const insertIndex = Math.max(1, rowIndex + 1);
      rows.splice(insertIndex, 0, [...rows[rowIndex]]);
      focus = { rowIndex: insertIndex, columnIndex: 0 };
      break;
    }
    case "insert-column-left": {
      rows.forEach((row) => row.splice(columnIndex, 0, ""));
      alignments.splice(columnIndex, 0, null);
      focus = { rowIndex, columnIndex };
      break;
    }
    case "insert-column-right": {
      const insertIndex = columnIndex + 1;
      rows.forEach((row) => row.splice(insertIndex, 0, ""));
      alignments.splice(insertIndex, 0, null);
      focus = { rowIndex, columnIndex: insertIndex };
      break;
    }
    case "delete-column": {
      if (width > 1) {
        rows.forEach((row) => row.splice(columnIndex, 1));
        alignments.splice(columnIndex, 1);
        focus = {
          rowIndex,
          columnIndex: Math.min(columnIndex, width - 2),
        };
      }
      break;
    }
    case "move-column-left": {
      if (columnIndex > 0) {
        rows.forEach((row) => swapArrayItems(row, columnIndex, columnIndex - 1));
        swapArrayItems(alignments, columnIndex, columnIndex - 1);
        focus = { rowIndex, columnIndex: columnIndex - 1 };
      }
      break;
    }
    case "move-column-right": {
      if (columnIndex < width - 1) {
        rows.forEach((row) => swapArrayItems(row, columnIndex, columnIndex + 1));
        swapArrayItems(alignments, columnIndex, columnIndex + 1);
        focus = { rowIndex, columnIndex: columnIndex + 1 };
      }
      break;
    }
    case "move-column-to": {
      const targetColumnIndex = clampInteger(operation.targetColumnIndex, 0, width - 1);
      if (columnIndex !== targetColumnIndex) {
        rows.forEach((row) => moveArrayItem(row, columnIndex, targetColumnIndex));
        moveArrayItem(alignments, columnIndex, targetColumnIndex);
        focus = { rowIndex, columnIndex: targetColumnIndex };
      }
      break;
    }
    case "set-column-alignment": {
      alignments[columnIndex] = operation.alignment;
      break;
    }
  }

  return {
    replacement: serializeMarkdownTable({ alignments, rows }),
    focus,
  };
}

export function sanitizeMarkdownTableCell(value: string): string {
  return normalizeLineEndings(value).replace(/\n+/g, " ").replace(/\|/g, "\\|").trim();
}

function isTableHeaderLine(text: string): boolean {
  return splitTableCells(text).length >= 1 && hasUnescapedPipe(text);
}

function isTableDelimiterLine(text: string): boolean {
  const cells = splitTableCells(text);
  return cells.length >= 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function splitTableCells(text: string): string[] {
  return splitTableCellSegments(text).map((cell) => unescapeMarkdownTablePipes(cell.text.trim()));
}

function splitTableCellsWithPositions(line: MarkdownSourceLine): MarkdownTableCell[] {
  const text = line.text;
  const segments = splitTableCellSegments(text);
  const pipeIndexes = getUnescapedPipeIndexes(text);
  if (pipeIndexes.length === 0) return [];

  const cells: MarkdownTableCell[] = [];
  for (const segment of segments) {
    const raw = segment.text;
    const leadingWhitespaceLength = raw.match(/^\s*/)?.[0].length ?? 0;
    const trailingWhitespaceLength = raw.match(/\s*$/)?.[0].length ?? 0;
    const cellFrom = line.from + segment.rawFrom + leadingWhitespaceLength;
    const cellTo = line.from + segment.rawTo - trailingWhitespaceLength;
    cells.push({
      text: unescapeMarkdownTablePipes(raw.trim()),
      from: cellFrom,
      to: Math.max(cellFrom, cellTo),
      editable: true,
    });
  }

  return cells;
}

function splitTableCellSegments(text: string): TableCellSegment[] {
  const pipeIndexes = getUnescapedPipeIndexes(text);
  if (pipeIndexes.length === 0) return [];

  const firstContentIndex = text.search(/\S/);
  const lastContentIndex = findLastNonWhitespaceIndex(text);
  const hasLeadingPipe = firstContentIndex >= 0 && text[firstContentIndex] === "|";
  const hasTrailingPipe = lastContentIndex >= 0 && text[lastContentIndex] === "|";
  const boundaries: number[] = [];

  if (hasLeadingPipe) {
    boundaries.push(pipeIndexes[0]);
    boundaries.push(...pipeIndexes.slice(1));
  } else {
    boundaries.push(-1, ...pipeIndexes);
  }

  if (!hasTrailingPipe) {
    boundaries.push(text.length);
  }

  const segments: TableCellSegment[] = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const rawFrom = Math.max(0, boundaries[index] + 1);
    const rawTo = Math.min(text.length, boundaries[index + 1]);
    segments.push({
      rawFrom,
      rawTo,
      text: text.slice(rawFrom, rawTo),
    });
  }
  return segments;
}

function getUnescapedPipeIndexes(text: string): number[] {
  const indexes: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "|" && !isEscapedMarkdownCharacter(text, index)) {
      indexes.push(index);
    }
  }
  return indexes;
}

function hasUnescapedPipe(text: string): boolean {
  return getUnescapedPipeIndexes(text).length > 0;
}

function isEscapedMarkdownCharacter(text: string, index: number): boolean {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function unescapeMarkdownTablePipes(value: string): string {
  return value.replace(/\\\|/g, "|");
}

function findLastNonWhitespaceIndex(text: string): number {
  for (let index = text.length - 1; index >= 0; index -= 1) {
    if (!/\s/.test(text[index])) return index;
  }
  return -1;
}

function normalizeTableRows(rows: MarkdownTableRow[], width: number): MarkdownTableRow[] {
  return rows.map((row) => ({
    ...row,
    cells: Array.from({ length: width }, (_, index) => row.cells[index] ?? {
      text: "",
      from: row.lineTo,
      to: row.lineTo,
      editable: false,
    }),
  }));
}

function parseTableAlignment(cell: string): MarkdownTableAlignment {
  const trimmed = cell.trim();
  const left = trimmed.startsWith(":");
  const right = trimmed.endsWith(":");
  if (left && right) return "center";
  if (left) return "left";
  if (right) return "right";
  return null;
}

function normalizeTableAlignments(
  alignments: readonly MarkdownTableAlignment[],
  width: number,
): MarkdownTableAlignment[] {
  return Array.from({ length: width }, (_, index) => alignments[index] ?? null);
}

function normalizeTableTextRows(rows: readonly MarkdownTableSerializableRow[]): string[][] {
  const normalized = rows.map((row) => {
    const cells = Array.isArray(row) ? row : row.cells.map((cell) => cell.text);
    return cells.map((cell) => String(cell));
  });
  return normalized.length > 0 ? normalized : [[""]];
}

function normalizeTextRow(row: readonly string[], width: number): string[] {
  return Array.from({ length: width }, (_, index) => row[index] ?? "");
}

function createEmptyTextRow(width: number): string[] {
  return Array.from({ length: width }, () => "");
}

function serializeMarkdownTableRow(cells: readonly string[], columnWidths: readonly number[]): string {
  return `| ${cells.map((cell, index) => sanitizeMarkdownTableCell(cell).padEnd(columnWidths[index])).join(" | ")} |`;
}

function createDelimiterCell(alignment: MarkdownTableAlignment): string {
  switch (alignment) {
    case "left":
      return ":---";
    case "center":
      return ":---:";
    case "right":
      return "---:";
    default:
      return "---";
  }
}

function swapArrayItems<T>(items: T[], from: number, to: number) {
  const item = items[from];
  items[from] = items[to];
  items[to] = item;
}

function moveArrayItem<T>(items: T[], from: number, to: number) {
  const [item] = items.splice(from, 1);
  items.splice(to, 0, item);
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}
