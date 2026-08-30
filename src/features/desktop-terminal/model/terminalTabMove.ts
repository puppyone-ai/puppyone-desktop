import type { WorkbenchSplitDropEdge } from "@puppyone/shared-ui";

type TerminalTabMoveDropIntentBase = Readonly<{
  sourceSessionId: string;
  targetGroupId: string;
  allowed: boolean;
}>;

export type TerminalTabSplitDropIntent = TerminalTabMoveDropIntentBase & Readonly<{
  kind: "split";
  edge: WorkbenchSplitDropEdge;
}>;

export type TerminalGroupMoveDropIntent = Readonly<{
  kind: "move-group";
  sourceGroupId: string;
  targetGroupId: string;
  edge: WorkbenchSplitDropEdge;
  allowed: boolean;
}>;

export type TerminalGroupMergeDropIntent = Readonly<{
  kind: "merge-group";
  sourceGroupId: string;
  sourceSessionIds: readonly string[];
  targetGroupId: string;
  /** Final index in the target Bar; source and target Groups are distinct. */
  targetIndex: number;
  allowed: boolean;
}>;

export type TerminalTabInsertDropIntent = TerminalTabMoveDropIntentBase & Readonly<{
  kind: "insert";
  /** Final index after the source Session is removed from its owner. */
  targetIndex: number;
}>;

export type TerminalTabMoveDropIntent =
  | TerminalTabInsertDropIntent
  | TerminalTabSplitDropIntent
  | TerminalGroupMoveDropIntent
  | TerminalGroupMergeDropIntent;

export type TerminalContentDropIntent =
  | TerminalTabSplitDropIntent
  | TerminalGroupMoveDropIntent;

export type TerminalTabBarDropIntent =
  | TerminalTabInsertDropIntent
  | TerminalGroupMergeDropIntent;

export function partitionTerminalGroupDropIntent(
  intent: TerminalTabMoveDropIntent | null,
  groupId: string,
): Readonly<{
  content: TerminalContentDropIntent | null;
  tabBar: TerminalTabBarDropIntent | null;
}> {
  const target = intent?.targetGroupId === groupId ? intent : null;
  return Object.freeze({
    content: target?.kind === "split" || target?.kind === "move-group"
      ? target
      : null,
    tabBar: target?.kind === "insert" || target?.kind === "merge-group"
      ? target
      : null,
  });
}

export const TERMINAL_TAB_DROP_PLACEHOLDER_ID = "terminal-tab-drop-placeholder";

export function sameTerminalTabMoveDropIntent(
  left: TerminalTabMoveDropIntent | null,
  right: TerminalTabMoveDropIntent | null,
): boolean {
  if (left === right) return true;
  if (
    !left
    || !right
    || left.kind !== right.kind
    || left.targetGroupId !== right.targetGroupId
    || left.allowed !== right.allowed
  ) return false;
  if (left.kind === "move-group" && right.kind === "move-group") {
    return left.sourceGroupId === right.sourceGroupId && left.edge === right.edge;
  }
  if (left.kind === "merge-group" && right.kind === "merge-group") {
    return left.sourceGroupId === right.sourceGroupId
      && left.targetIndex === right.targetIndex;
  }
  if (left.kind === "split" && right.kind === "split") {
    return left.sourceSessionId === right.sourceSessionId && left.edge === right.edge;
  }
  return left.kind === "insert" && right.kind === "insert"
    && left.sourceSessionId === right.sourceSessionId
    && left.targetIndex === right.targetIndex;
}

export type TerminalTabInsertionPreview = Readonly<{
  layoutActiveSessionId: string | null;
  layoutSessionIds: readonly string[];
  placeholderSessionIds: readonly string[];
}>;

/** Projects the target Tab Bar without mutating Group membership during drag. */
export function projectTerminalTabInsertionPreview(
  sessionIds: readonly string[],
  activeSessionId: string | null,
  sourceSessionId: string,
  targetIndex: number,
): TerminalTabInsertionPreview {
  const sourceIsLocal = sessionIds.includes(sourceSessionId);
  const remaining = sourceIsLocal
    ? sessionIds.filter((sessionId) => sessionId !== sourceSessionId)
    : [...sessionIds];
  const insertionIndex = Math.max(0, Math.min(targetIndex, remaining.length));
  const previewId = sourceIsLocal
    ? sourceSessionId
    : TERMINAL_TAB_DROP_PLACEHOLDER_ID;
  const layoutSessionIds = [
    ...remaining.slice(0, insertionIndex),
    previewId,
    ...remaining.slice(insertionIndex),
  ];
  return Object.freeze({
    layoutActiveSessionId: sourceIsLocal ? activeSessionId : previewId,
    layoutSessionIds: Object.freeze(layoutSessionIds),
    placeholderSessionIds: Object.freeze(sourceIsLocal ? [] : [previewId]),
  });
}


/** Projects an entire source Group as an ordered block in another Tab Bar. */
export function projectTerminalGroupInsertionPreview(
  sessionIds: readonly string[],
  sourceSessionIds: readonly string[],
  targetIndex: number,
): TerminalTabInsertionPreview {
  const insertionIndex = Math.max(0, Math.min(targetIndex, sessionIds.length));
  const placeholders = sourceSessionIds.map((_, index) => (
    `${TERMINAL_TAB_DROP_PLACEHOLDER_ID}-${index}`
  ));
  const layoutSessionIds = [
    ...sessionIds.slice(0, insertionIndex),
    ...placeholders,
    ...sessionIds.slice(insertionIndex),
  ];
  return Object.freeze({
    layoutActiveSessionId: placeholders[0] ?? null,
    layoutSessionIds: Object.freeze(layoutSessionIds),
    placeholderSessionIds: Object.freeze(placeholders),
  });
}
