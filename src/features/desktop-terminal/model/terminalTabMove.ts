import type { WorkbenchSplitDropEdge } from "@puppyone/shared-ui";

export type TerminalTabMoveDropIntent = Readonly<{
  targetSessionId: string;
  edge: WorkbenchSplitDropEdge;
  allowed: boolean;
}>;

export function sameTerminalTabMoveDropIntent(
  left: TerminalTabMoveDropIntent | null,
  right: TerminalTabMoveDropIntent | null,
): boolean {
  return left === right || Boolean(
    left
    && right
    && left.targetSessionId === right.targetSessionId
    && left.edge === right.edge
    && left.allowed === right.allowed,
  );
}
