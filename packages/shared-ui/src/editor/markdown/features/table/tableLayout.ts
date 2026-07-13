import type { MarkdownTableAlignment, MarkdownTableRow } from "./tableModel";

const TABLE_VERTICAL_CHROME_PX = 50;
const TABLE_ROW_VERTICAL_CHROME_PX = 13;
const TABLE_TEXT_LINE_HEIGHT_PX = 19;
const TABLE_CELL_LINE_CAPACITY = 36;
const TABLE_COLUMN_WIDTH_SAMPLE_ROWS = 128;

/**
 * Pure layout estimate shared by the semantic plan and its widget descriptor.
 * The centralized render-budget policy rejects blocks beyond the supported
 * logical range, so this estimate can remain proportional for every table
 * that reaches either the rich or windowed adapter.
 */
export function estimateMarkdownTableLayoutHeight(rows: readonly MarkdownTableRow[]): number {
  const rowHeights = rows.reduce((total, row) => total + estimateMarkdownTableRowHeight(row), 0);
  return Math.max(80, Math.ceil(TABLE_VERTICAL_CHROME_PX + rowHeights));
}

export function estimateMarkdownTableRowHeight(row: MarkdownTableRow): number {
  const visualLines = Math.max(1, ...row.cells.map((cell) => estimateCellVisualLines(cell.text)));
  return Math.ceil(TABLE_ROW_VERTICAL_CHROME_PX + visualLines * TABLE_TEXT_LINE_HEIGHT_PX);
}

export function estimateMarkdownTableColumnWidths(
  alignments: readonly MarkdownTableAlignment[],
  rows: readonly MarkdownTableRow[],
): readonly number[] {
  const sampledRows = sampleTableRows(rows, TABLE_COLUMN_WIDTH_SAMPLE_ROWS);
  const columnCount = Math.max(1, alignments.length, ...sampledRows.map((row) => row.cells.length));
  return Array.from({ length: columnCount }, (_, columnIndex) => {
    let visualUnits = 0;
    for (const row of sampledRows) {
      const text = row.cells[columnIndex]?.text ?? "";
      visualUnits = Math.max(visualUnits, estimateMaxLineVisualUnits(text));
    }
    return Math.max(96, Math.min(280, 28 + visualUnits * 7));
  });
}

function sampleTableRows(
  rows: readonly MarkdownTableRow[],
  maximum: number,
): readonly MarkdownTableRow[] {
  if (rows.length <= maximum) return rows;
  const sampled: MarkdownTableRow[] = [];
  const seen = new Set<number>();
  for (let sampleIndex = 0; sampleIndex < maximum; sampleIndex += 1) {
    const rowIndex = Math.round(sampleIndex * (rows.length - 1) / (maximum - 1));
    if (seen.has(rowIndex)) continue;
    seen.add(rowIndex);
    sampled.push(rows[rowIndex]);
  }
  return sampled;
}

/** Stable semantic identity used by WidgetType.eq without serializing a table. */
export function createMarkdownTableRenderKey(
  alignments: readonly MarkdownTableAlignment[],
  rows: readonly MarkdownTableRow[],
): string {
  let hashA = 0x811c9dc5;
  let hashB = 0x9e3779b9;
  let sourceUnits = 0;
  const add = (value: string) => {
    sourceUnits += value.length;
    for (let index = 0; index < value.length; index += 1) {
      const unit = value.charCodeAt(index);
      hashA = Math.imul(hashA ^ unit, 0x01000193);
      hashB = Math.imul(hashB ^ unit, 0x85ebca6b);
      hashB ^= hashB >>> 13;
    }
    hashA = Math.imul(hashA ^ 0xff, 0x01000193);
    hashB = Math.imul(hashB ^ 0x7f, 0xc2b2ae35);
  };

  for (const alignment of alignments) add(alignment ?? "none");
  for (const row of rows) {
    add(row.header ? "header" : "body");
    add(String(row.lineTo));
    for (const cell of row.cells) {
      add(cell.editable ? "editable" : "readonly");
      add(`${cell.from}:${cell.to}`);
      add(cell.text);
    }
  }

  return `${alignments.length}:${rows.length}:${sourceUnits}:${(hashA >>> 0).toString(36)}:${(hashB >>> 0).toString(36)}`;
}

function estimateCellVisualLines(text: string): number {
  return text.split("\n").reduce((total, line) => {
    let width = 0;
    for (const character of line) {
      if (character === "\t") width += 4;
      else width += character.codePointAt(0)! > 0xff ? 2 : 1;
    }
    return total + Math.max(1, Math.ceil(width / TABLE_CELL_LINE_CAPACITY));
  }, 0);
}

function estimateMaxLineVisualUnits(text: string): number {
  let maximum = 0;
  let current = 0;
  for (const character of text) {
    if (character === "\n") {
      maximum = Math.max(maximum, current);
      current = 0;
    } else if (character === "\t") {
      current += 4;
    } else {
      current += character.codePointAt(0)! > 0xff ? 2 : 1;
    }
  }
  return Math.max(maximum, current);
}
