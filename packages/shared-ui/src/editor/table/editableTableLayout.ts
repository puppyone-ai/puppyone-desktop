const EDITABLE_TABLE_COLUMN_WIDTH_SAMPLE_ROWS = 128;

export const EDITABLE_TABLE_COLUMN_MIN_WIDTH = 96;
export const EDITABLE_TABLE_COLUMN_MAX_WIDTH = 280;

/**
 * Estimate stable table column widths without measuring rendered DOM nodes.
 * Sampling keeps the calculation bounded for large CSV and Markdown tables,
 * while the first/last rows and the space between them remain represented.
 */
export function estimateEditableTableColumnWidths<Row>(
  rows: readonly Row[],
  minimumColumnCount: number,
  getCells: (row: Row) => readonly string[],
): readonly number[] {
  const sampledRows = sampleTableRows(rows, EDITABLE_TABLE_COLUMN_WIDTH_SAMPLE_ROWS);
  const sampledCells = sampledRows.map(getCells);
  const columnCount = Math.max(
    1,
    minimumColumnCount,
    ...sampledCells.map((cells) => cells.length),
  );

  return Array.from({ length: columnCount }, (_, columnIndex) => {
    let visualUnits = 0;
    for (const cells of sampledCells) {
      visualUnits = Math.max(
        visualUnits,
        estimateMaxLineVisualUnits(cells[columnIndex] ?? ""),
      );
    }
    return Math.max(
      EDITABLE_TABLE_COLUMN_MIN_WIDTH,
      Math.min(EDITABLE_TABLE_COLUMN_MAX_WIDTH, 28 + visualUnits * 7),
    );
  });
}

function sampleTableRows<Row>(rows: readonly Row[], maximum: number): readonly Row[] {
  if (rows.length <= maximum) return rows;
  const sampled: Row[] = [];
  const seen = new Set<number>();
  for (let sampleIndex = 0; sampleIndex < maximum; sampleIndex += 1) {
    const rowIndex = Math.round(sampleIndex * (rows.length - 1) / (maximum - 1));
    if (seen.has(rowIndex)) continue;
    seen.add(rowIndex);
    sampled.push(rows[rowIndex]);
  }
  return sampled;
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
