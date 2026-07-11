import type { ExplorerVisibleRow } from "./explorerVisibleModel";

export type ExplorerRowMotionInstruction = {
  kind: "enter" | "move";
  offsetY: number;
};

export type ExplorerExitGhost = {
  row: ExplorerVisibleRow;
  top: number;
};

export type ExplorerMotionPlan = {
  instructions: ReadonlyMap<string, ExplorerRowMotionInstruction>;
  ghosts: readonly ExplorerExitGhost[];
};

/**
 * FLIP plan for the currently mounted virtual window. Work is bounded by the
 * mounted rows, never by the full expanded tree. Removed rows become inert
 * visual ghosts only when capacity remains under the global DOM-row limit.
 */
export function createExplorerMotionPlan({
  previousRows,
  nextRows,
  previousMountedRows,
  nextMountedRows,
  rowSize,
  maxMountedRows,
}: {
  previousRows: readonly ExplorerVisibleRow[];
  nextRows: readonly ExplorerVisibleRow[];
  previousMountedRows: readonly ExplorerVisibleRow[];
  nextMountedRows: readonly ExplorerVisibleRow[];
  rowSize: number;
  maxMountedRows: number;
}): ExplorerMotionPlan {
  const previousIndex = new Map(previousRows.map((row) => [row.key, row.index]));
  const previousMountedKeys = new Set(previousMountedRows.map((row) => row.key));
  const nextKeys = new Set(nextRows.map((row) => row.key));
  const instructions = new Map<string, ExplorerRowMotionInstruction>();

  for (const row of nextMountedRows) {
    const oldIndex = previousIndex.get(row.key);
    if (oldIndex === undefined) {
      instructions.set(row.key, { kind: "enter", offsetY: -6 });
      continue;
    }
    if (!previousMountedKeys.has(row.key)) continue;
    const offsetY = (oldIndex - row.index) * rowSize;
    if (offsetY !== 0) instructions.set(row.key, { kind: "move", offsetY });
  }

  const ghostCapacity = Math.max(0, maxMountedRows - nextMountedRows.length);
  const ghosts = previousMountedRows
    .filter((row) => !nextKeys.has(row.key))
    .slice(0, ghostCapacity)
    .map((row) => ({ row, top: row.index * rowSize }));

  return { instructions, ghosts };
}
