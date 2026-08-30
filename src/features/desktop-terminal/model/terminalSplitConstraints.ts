import {
  workbenchSplitDefinition,
  workbenchSplitNodeMinimumSize,
  workbenchSplitRatioBounds,
  type WorkbenchSplitDropEdge,
  type WorkbenchSplitMinimumSize,
  type WorkbenchSplitRatioBounds,
} from "@puppyone/shared-ui";
import type {
  DesktopTerminalLayoutNode,
  DesktopTerminalLayoutSplit,
} from "./terminalSessions";
import type { TerminalMinimumViewportSize } from "../runtime/terminalRuntime";

export type TerminalSplitMinimumSize = WorkbenchSplitMinimumSize;
export type TerminalSplitRatioBounds = WorkbenchSplitRatioBounds;

export const TERMINAL_SPLIT_DIVIDER_SIZE = 1;
export const TERMINAL_FALLBACK_MINIMUM_VIEWPORT: TerminalMinimumViewportSize = Object.freeze({
  width: 172,
  height: 128,
});
const TERMINAL_PANE_INLINE_INSET = 16;
const TERMINAL_PANE_BLOCK_INSET = 30;
const TERMINAL_GROUP_HEADER_BLOCK_SIZE = 38;

export function terminalLeafMinimumSize(
  viewport: TerminalMinimumViewportSize | null | undefined,
): TerminalSplitMinimumSize {
  const measured = viewport ?? TERMINAL_FALLBACK_MINIMUM_VIEWPORT;
  return Object.freeze({
    width: Math.max(1, measured.width) + TERMINAL_PANE_INLINE_INSET,
    height: Math.max(1, measured.height)
      + TERMINAL_PANE_BLOCK_INSET
      + TERMINAL_GROUP_HEADER_BLOCK_SIZE,
  });
}

export function terminalSplitNodeMinimumSize(
  node: DesktopTerminalLayoutNode,
  getLeafMinimum: (groupId: string) => TerminalSplitMinimumSize,
  dividerSize = TERMINAL_SPLIT_DIVIDER_SIZE,
): TerminalSplitMinimumSize {
  return workbenchSplitNodeMinimumSize(
    node,
    (leaf) => getLeafMinimum(leaf.groupId),
    dividerSize,
  );
}

export function terminalSplitChildMinimumSizes(
  split: DesktopTerminalLayoutSplit,
  getLeafMinimum: (groupId: string) => TerminalSplitMinimumSize,
): Readonly<{ first: TerminalSplitMinimumSize; second: TerminalSplitMinimumSize }> {
  return Object.freeze({
    first: terminalSplitNodeMinimumSize(split.first, getLeafMinimum),
    second: terminalSplitNodeMinimumSize(split.second, getLeafMinimum),
  });
}

export function terminalSplitRatioBounds(
  direction: DesktopTerminalLayoutSplit["direction"],
  totalSize: number,
  dividerSize: number,
  firstMinimum: TerminalSplitMinimumSize,
  secondMinimum: TerminalSplitMinimumSize,
): TerminalSplitRatioBounds {
  return workbenchSplitRatioBounds(
    direction,
    totalSize,
    dividerSize,
    firstMinimum,
    secondMinimum,
  );
}

export function canPlaceTerminalSplit(
  targetRect: Pick<DOMRect, "height" | "width">,
  edge: WorkbenchSplitDropEdge,
  sourceMinimum: TerminalSplitMinimumSize,
  targetMinimum: TerminalSplitMinimumSize,
  dividerSize = TERMINAL_SPLIT_DIVIDER_SIZE,
): boolean {
  const { direction } = workbenchSplitDefinition(edge);
  if (direction === "horizontal") {
    return targetRect.width >= sourceMinimum.width + dividerSize + targetMinimum.width
      && targetRect.height >= Math.max(sourceMinimum.height, targetMinimum.height);
  }
  return targetRect.height >= sourceMinimum.height + dividerSize + targetMinimum.height
    && targetRect.width >= Math.max(sourceMinimum.width, targetMinimum.width);
}

export function clampTerminalRatioToBounds(
  ratio: number,
  bounds: TerminalSplitRatioBounds,
): number {
  if (!Number.isFinite(ratio)) return Math.min(bounds.maximum, Math.max(bounds.minimum, 0.5));
  return Math.min(bounds.maximum, Math.max(bounds.minimum, Math.round(ratio * 1_000) / 1_000));
}
