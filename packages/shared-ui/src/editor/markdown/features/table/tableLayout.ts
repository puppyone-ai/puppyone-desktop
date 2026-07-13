import type { MarkdownTableAlignment, MarkdownTableRow } from "./tableModel";

const TABLE_VERTICAL_CHROME_PX = 50;
const TABLE_ROW_VERTICAL_CHROME_PX = 13;
const TABLE_TEXT_LINE_HEIGHT_PX = 19;
const TABLE_CELL_LINE_CAPACITY = 36;

/**
 * Pure layout estimate shared by the semantic plan and its widget descriptor.
 * It intentionally has no upper clamp: an offscreen large table must reserve
 * proportional space or CodeMirror's scroll anchor will be corrected by a
 * large delta when the real DOM enters the viewport.
 */
export function estimateMarkdownTableLayoutHeight(rows: readonly MarkdownTableRow[]): number {
  const rowHeights = rows.reduce((total, row) => {
    const visualLines = Math.max(1, ...row.cells.map((cell) => estimateCellVisualLines(cell.text)));
    return total + TABLE_ROW_VERTICAL_CHROME_PX + visualLines * TABLE_TEXT_LINE_HEIGHT_PX;
  }, 0);
  return Math.max(80, Math.ceil(TABLE_VERTICAL_CHROME_PX + rowHeights));
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
