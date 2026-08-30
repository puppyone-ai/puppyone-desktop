import {
  collectWorkbenchSplitLeaves,
  extractWorkbenchSplitLeaf,
  findWorkbenchSplitLeaf,
  insertWorkbenchSplitLeafAtEdge,
  isWorkbenchSplit,
  moveWorkbenchSplitLeafToEdge,
  updateWorkbenchSplitRatio,
  visitWorkbenchSplitNodes,
  workbenchSplitDefinition,
  type WorkbenchSplit,
  type WorkbenchSplitDropEdge,
  type WorkbenchSplitLeaf,
  type WorkbenchSplitNode,
} from "@puppyone/shared-ui";
import type { DesktopTerminalLauncherId } from "./terminalLaunchers";

export type DesktopTerminalSessionStatus =
  | "selecting"
  | "starting"
  | "running"
  | "exited"
  | "error";

export type DesktopTerminalSessionSummary = Readonly<{
  id: string;
  launcherId: DesktopTerminalLauncherId | null;
  ordinal: number;
  shell: string | null;
  status: DesktopTerminalSessionStatus;
}>;

export type DesktopTerminalSession = DesktopTerminalSessionSummary & Readonly<{
  launchError: string | null;
}>;

/** One visible split leaf. The leaf owns a local Tab stack, not a Runtime. */
export type DesktopTerminalGroup = Readonly<{
  id: string;
  sessionIds: readonly string[];
  activeSessionId: string;
}>;

export type DesktopTerminalLayoutLeaf = WorkbenchSplitLeaf<"group", {
  groupId: string;
}>;
export type DesktopTerminalLayoutSplit = WorkbenchSplit<DesktopTerminalLayoutLeaf>;
export type DesktopTerminalLayoutNode = WorkbenchSplitNode<DesktopTerminalLayoutLeaf>;

export type DesktopTerminalSessionsState = Readonly<{
  sessions: readonly DesktopTerminalSession[];
  groups: readonly DesktopTerminalGroup[];
  root: DesktopTerminalLayoutNode | null;
  activeGroupId: string | null;
  nextOrdinal: number;
}>;

export type DesktopTerminalSessionsAction =
  | {
    type: "create";
    sessionId: string;
    groupId: string;
    targetGroupId?: string | null;
    launcherId: DesktopTerminalLauncherId;
  }
  | {
    type: "create-launcher";
    sessionId: string;
    groupId: string;
    targetGroupId?: string | null;
  }
  | { type: "launch"; sessionId: string; launcherId: DesktopTerminalLauncherId }
  | { type: "activate"; sessionId: string }
  | { type: "close"; sessionId: string }
  | {
    type: "split-tab";
    sourceSessionId: string;
    targetGroupId: string;
    edge: WorkbenchSplitDropEdge;
    groupId: string;
    splitId: string;
  }
  | {
    type: "merge-tab";
    sourceSessionId: string;
    targetGroupId: string;
    targetIndex: number;
  }
  | {
    type: "move-group";
    sourceGroupId: string;
    targetGroupId: string;
    edge: WorkbenchSplitDropEdge;
    splitId: string;
  }
  | {
    type: "merge-group";
    sourceGroupId: string;
    targetGroupId: string;
    targetIndex: number;
  }
  | { type: "resize-split"; splitId: string; ratio: number }
  | {
    type: "runtime-status";
    sessionId: string;
    status: DesktopTerminalSessionStatus;
    shell?: string | null;
    error?: string | null;
  };

export function createDesktopTerminalSessionsState(
  initialSessionId: string | null = null,
): DesktopTerminalSessionsState {
  if (!initialSessionId) return freezeState([], [], null, null, 1);
  const session = createSession(initialSessionId, 1, "starting", "shell");
  const group = createGroup(`terminal-group-${initialSessionId}`, initialSessionId);
  return freezeState([session], [group], createGroupLeaf(group.id), group.id, 2);
}

export function desktopTerminalSessionsReducer(
  state: DesktopTerminalSessionsState,
  action: DesktopTerminalSessionsAction,
): DesktopTerminalSessionsState {
  if (action.type === "create") {
    if (hasSession(state, action.sessionId)) return state;
    return insertNewSession(
      state,
      createSession(action.sessionId, state.nextOrdinal, "starting", action.launcherId),
      action.groupId,
      action.targetGroupId,
    );
  }

  if (action.type === "create-launcher") {
    const requestedGroupId = action.targetGroupId ?? state.activeGroupId;
    const targetGroup = state.groups.find((group) => group.id === requestedGroupId);
    const existingSessionId = targetGroup?.sessionIds.find((sessionId) => (
      state.sessions.some((session) => (
        session.id === sessionId && session.status === "selecting"
      ))
    ));
    if (existingSessionId) return activateSession(state, existingSessionId);
    if (hasSession(state, action.sessionId)) return state;
    return insertNewSession(
      state,
      createSession(action.sessionId, state.nextOrdinal, "selecting", null),
      action.groupId,
      action.targetGroupId,
    );
  }

  if (action.type === "launch") {
    let changed = false;
    const sessions = state.sessions.map((session) => {
      if (session.id !== action.sessionId || session.status !== "selecting") return session;
      changed = true;
      return Object.freeze({
        ...session,
        launcherId: action.launcherId,
        launchError: null,
        status: "starting" as const,
      });
    });
    return changed ? finalize({ ...state, sessions }) : state;
  }

  if (action.type === "activate") return activateSession(state, action.sessionId);

  if (action.type === "split-tab") return splitTabToNewGroup(state, action);

  if (action.type === "merge-tab") {
    return mergeTabIntoGroup(
      state,
      action.sourceSessionId,
      action.targetGroupId,
      action.targetIndex,
    );
  }

  if (action.type === "move-group") {
    return moveGroupToEdge(state, action);
  }

  if (action.type === "merge-group") {
    return mergeGroupIntoGroup(state, action);
  }

  if (action.type === "resize-split") {
    if (!state.root) return state;
    const root = updateWorkbenchSplitRatio(
      state.root,
      action.splitId,
      clampTerminalSplitRatio(action.ratio),
    );
    return root === state.root ? state : finalize({ ...state, root });
  }

  if (action.type === "close") return closeSession(state, action.sessionId);

  if (action.type === "runtime-status") {
    let changed = false;
    const sessions = state.sessions.map((session) => {
      if (session.id !== action.sessionId) return session;
      if (action.status === "error" && session.status === "starting") {
        changed = true;
        return Object.freeze({
          ...session,
          launcherId: null,
          launchError: action.error ?? null,
          shell: null,
          status: "selecting" as const,
        });
      }
      const shell = action.shell === undefined ? session.shell : action.shell;
      if (
        session.status === action.status
        && session.shell === shell
        && session.launchError === null
      ) return session;
      changed = true;
      return Object.freeze({
        ...session,
        launchError: null,
        shell,
        status: action.status,
      });
    });
    return changed ? finalize({ ...state, sessions }) : state;
  }

  return state;
}

export function getActiveTerminalGroup(
  state: DesktopTerminalSessionsState,
): DesktopTerminalGroup | null {
  return state.groups.find((group) => group.id === state.activeGroupId) ?? null;
}

export function getActiveTerminalSessionId(
  state: DesktopTerminalSessionsState,
): string | null {
  return getActiveTerminalGroup(state)?.activeSessionId ?? null;
}

export function getPresentedTerminalSessionIds(
  state: DesktopTerminalSessionsState,
): readonly string[] {
  return Object.freeze(getTerminalLayoutGroupIds(state.root).flatMap((groupId) => {
    const group = state.groups.find((candidate) => candidate.id === groupId);
    return group ? [group.activeSessionId] : [];
  }));
}

export function findTerminalSessionGroup(
  state: DesktopTerminalSessionsState,
  sessionId: string,
): DesktopTerminalGroup | null {
  return state.groups.find((group) => group.sessionIds.includes(sessionId)) ?? null;
}

export function getTerminalGroupSessionIds(group: DesktopTerminalGroup): readonly string[] {
  return group.sessionIds;
}

export function getTerminalLayoutGroupIds(
  root: DesktopTerminalLayoutNode | null,
): readonly string[] {
  return root
    ? Object.freeze(collectWorkbenchSplitLeaves(root).map((leaf) => leaf.groupId))
    : Object.freeze([]);
}

export function getOrderedTerminalSessions(
  state: DesktopTerminalSessionsState,
): readonly DesktopTerminalSession[] {
  const sessionById = new Map(state.sessions.map((session) => [session.id, session]));
  const groupById = new Map(state.groups.map((group) => [group.id, group]));
  return Object.freeze(getTerminalLayoutGroupIds(state.root).flatMap((groupId) => (
    (groupById.get(groupId)?.sessionIds ?? [])
      .map((sessionId) => sessionById.get(sessionId))
      .filter((session): session is DesktopTerminalSession => Boolean(session))
  )));
}

export function canSplitTerminalSession(
  state: DesktopTerminalSessionsState,
  sessionId: string,
  targetGroupId: string,
): boolean {
  const sourceGroup = findTerminalSessionGroup(state, sessionId);
  const targetGroup = state.groups.find((group) => group.id === targetGroupId);
  if (!sourceGroup || !targetGroup) return false;
  return sourceGroup.id !== targetGroup.id || sourceGroup.sessionIds.length > 1;
}

/**
 * Validates an insertion index after the source Session has been removed from
 * its owner. This one convention makes same-Group reorder and cross-Group
 * merge share an atomic reducer command without index correction at commit.
 */
export function canInsertTerminalSession(
  state: DesktopTerminalSessionsState,
  sessionId: string,
  targetGroupId: string,
  targetIndex: number,
): boolean {
  const sourceGroup = findTerminalSessionGroup(state, sessionId);
  const targetGroup = state.groups.find((group) => group.id === targetGroupId);
  if (!sourceGroup || !targetGroup || !Number.isInteger(targetIndex)) return false;
  const targetLengthAfterRemoval = targetGroup.sessionIds.length
    - (sourceGroup.id === targetGroup.id ? 1 : 0);
  return targetIndex >= 0 && targetIndex <= targetLengthAfterRemoval;
}

/** Group movement only changes split-tree placement; it never adds a leaf. */
export function canMoveTerminalGroup(
  state: DesktopTerminalSessionsState,
  sourceGroupId: string,
  targetGroupId: string,
): boolean {
  if (!state.root || !isWorkbenchSplit(state.root) || sourceGroupId === targetGroupId) {
    return false;
  }
  return Boolean(
    state.groups.some((group) => group.id === sourceGroupId)
    && state.groups.some((group) => group.id === targetGroupId)
    && findWorkbenchSplitLeaf(state.root, sourceGroupId)
    && findWorkbenchSplitLeaf(state.root, targetGroupId),
  );
}

export function canMergeTerminalGroup(
  state: DesktopTerminalSessionsState,
  sourceGroupId: string,
  targetGroupId: string,
  targetIndex: number,
): boolean {
  const sourceGroup = state.groups.find((group) => group.id === sourceGroupId);
  const targetGroup = state.groups.find((group) => group.id === targetGroupId);
  return Boolean(
    state.root
    && sourceGroup
    && targetGroup
    && sourceGroup.id !== targetGroup.id
    && Number.isInteger(targetIndex)
    && targetIndex >= 0
    && targetIndex <= targetGroup.sessionIds.length,
  );
}

export function assertDesktopTerminalSessionsState(
  state: DesktopTerminalSessionsState,
): void {
  const errors = desktopTerminalSessionsStateErrors(state);
  if (errors.length > 0) {
    throw new Error(`Invalid Desktop Terminal state: ${errors.join("; ")}`);
  }
}

export function desktopTerminalSessionsStateErrors(
  state: DesktopTerminalSessionsState,
): readonly string[] {
  const errors: string[] = [];
  const sessionIds = new Set<string>();
  for (const session of state.sessions) {
    if (!session.id || sessionIds.has(session.id)) errors.push(`duplicate Session ${session.id}`);
    sessionIds.add(session.id);
  }

  const groupIds = new Set<string>();
  const ownedSessionIds = new Set<string>();
  for (const group of state.groups) {
    if (!group.id || groupIds.has(group.id)) errors.push(`duplicate Group ${group.id}`);
    groupIds.add(group.id);
    if (group.sessionIds.length === 0) errors.push(`empty Group ${group.id}`);
    if (!group.sessionIds.includes(group.activeSessionId)) {
      errors.push(`Group ${group.id} active Session is outside its Tab stack`);
    }
    for (const sessionId of group.sessionIds) {
      if (!sessionIds.has(sessionId)) errors.push(`missing Session ${sessionId}`);
      if (ownedSessionIds.has(sessionId)) errors.push(`Session ${sessionId} has two owners`);
      ownedSessionIds.add(sessionId);
    }
  }
  for (const sessionId of sessionIds) {
    if (!ownedSessionIds.has(sessionId)) errors.push(`Session ${sessionId} has no Group`);
  }

  const layoutGroupIds = new Set<string>();
  const nodeIds = new Set<string>();
  if (state.root) {
    visitWorkbenchSplitNodes(state.root, (node) => {
      if (!node.id || nodeIds.has(node.id)) errors.push(`duplicate layout node ${node.id}`);
      nodeIds.add(node.id);
      if (isWorkbenchSplit(node)) return;
      if (node.id !== node.groupId) errors.push(`Group leaf identity mismatch ${node.id}`);
      if (!groupIds.has(node.groupId)) errors.push(`missing Group ${node.groupId}`);
      if (layoutGroupIds.has(node.groupId)) errors.push(`Group ${node.groupId} has two leaves`);
      layoutGroupIds.add(node.groupId);
    });
  }
  for (const groupId of groupIds) {
    if (!layoutGroupIds.has(groupId)) errors.push(`Group ${groupId} has no layout leaf`);
  }
  if ((state.groups.length === 0) !== (state.root === null)) {
    errors.push("empty workbench root mismatch");
  }
  if (state.groups.length === 0 && state.activeGroupId !== null) {
    errors.push("empty workbench has active Group");
  }
  if (state.groups.length > 0 && !groupIds.has(state.activeGroupId ?? "")) {
    errors.push("active Group is missing");
  }
  return Object.freeze(errors);
}

export function clampTerminalSplitRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0.5;
  return Math.min(0.99, Math.max(0.01, Math.round(ratio * 1_000) / 1_000));
}

function insertNewSession(
  state: DesktopTerminalSessionsState,
  session: DesktopTerminalSession,
  nextGroupId: string,
  requestedGroupId?: string | null,
): DesktopTerminalSessionsState {
  const targetGroup = state.groups.find((group) => (
    group.id === (requestedGroupId ?? state.activeGroupId)
  ));
  if (targetGroup) {
    const groups = state.groups.map((group) => group.id === targetGroup.id
      ? freezeGroup({
          ...group,
          sessionIds: [...group.sessionIds, session.id],
          activeSessionId: session.id,
        })
      : group);
    return finalize({
      ...state,
      sessions: [...state.sessions, session],
      groups,
      activeGroupId: targetGroup.id,
      nextOrdinal: state.nextOrdinal + 1,
    });
  }

  if (state.root || state.groups.length > 0 || hasGroup(state, nextGroupId)) return state;
  const group = createGroup(nextGroupId, session.id);
  return finalize({
    ...state,
    sessions: [session],
    groups: [group],
    root: createGroupLeaf(group.id),
    activeGroupId: group.id,
    nextOrdinal: state.nextOrdinal + 1,
  });
}

function activateSession(
  state: DesktopTerminalSessionsState,
  sessionId: string,
): DesktopTerminalSessionsState {
  const owner = findTerminalSessionGroup(state, sessionId);
  if (!owner) return state;
  if (owner.activeSessionId === sessionId && state.activeGroupId === owner.id) return state;
  const groups = owner.activeSessionId === sessionId
    ? state.groups
    : state.groups.map((group) => group.id === owner.id
      ? freezeGroup({ ...group, activeSessionId: sessionId })
      : group);
  return finalize({ ...state, groups, activeGroupId: owner.id });
}

function splitTabToNewGroup(
  state: DesktopTerminalSessionsState,
  action: Extract<DesktopTerminalSessionsAction, { type: "split-tab" }>,
): DesktopTerminalSessionsState {
  if (
    !state.root
    || hasGroup(state, action.groupId)
    || hasLayoutNode(state, action.splitId)
    || !canSplitTerminalSession(state, action.sourceSessionId, action.targetGroupId)
  ) return state;
  const sourceGroup = findTerminalSessionGroup(state, action.sourceSessionId)!;
  const targetGroup = state.groups.find((group) => group.id === action.targetGroupId)!;
  let root = state.root;
  let groups = [...state.groups];

  if (sourceGroup.sessionIds.length === 1) {
    const extracted = extractWorkbenchSplitLeaf(root, sourceGroup.id);
    if (!extracted.leaf || !extracted.root) return state;
    root = extracted.root;
    groups = groups.filter((group) => group.id !== sourceGroup.id);
  } else {
    const sourceIndex = sourceGroup.sessionIds.indexOf(action.sourceSessionId);
    const remaining = sourceGroup.sessionIds.filter((id) => id !== action.sourceSessionId);
    const fallbackIndex = Math.min(sourceIndex, remaining.length - 1);
    groups = groups.map((group) => group.id === sourceGroup.id
      ? freezeGroup({
          ...group,
          sessionIds: remaining,
          activeSessionId: group.activeSessionId === action.sourceSessionId
            ? remaining[fallbackIndex]!
            : group.activeSessionId,
        })
      : group);
  }

  if (!findWorkbenchSplitLeaf(root, targetGroup.id)) return state;
  const { direction, placement } = workbenchSplitDefinition(action.edge);
  const nextGroup = createGroup(action.groupId, action.sourceSessionId);
  const nextRoot = insertWorkbenchSplitLeafAtEdge(
    root,
    targetGroup.id,
    createGroupLeaf(nextGroup.id),
    direction,
    placement,
    action.splitId,
  );
  if (nextRoot === root) return state;
  const targetIndex = groups.findIndex((group) => group.id === targetGroup.id);
  groups.splice(targetIndex + 1, 0, nextGroup);
  return finalize({
    ...state,
    groups,
    root: nextRoot,
    activeGroupId: nextGroup.id,
  });
}

function mergeTabIntoGroup(
  state: DesktopTerminalSessionsState,
  sourceSessionId: string,
  targetGroupId: string,
  targetIndex: number,
): DesktopTerminalSessionsState {
  if (
    !state.root
    || !canInsertTerminalSession(state, sourceSessionId, targetGroupId, targetIndex)
  ) return state;
  const sourceGroup = findTerminalSessionGroup(state, sourceSessionId);
  const targetGroup = state.groups.find((group) => group.id === targetGroupId);
  if (!sourceGroup || !targetGroup) return state;

  if (sourceGroup.id === targetGroup.id) {
    const remaining = sourceGroup.sessionIds.filter((id) => id !== sourceSessionId);
    const reordered = insertAt(remaining, sourceSessionId, targetIndex);
    const orderUnchanged = reordered.every(
      (sessionId, index) => sessionId === sourceGroup.sessionIds[index],
    );
    if (orderUnchanged && state.activeGroupId === targetGroup.id) return state;
    const groups = orderUnchanged
      ? state.groups
      : state.groups.map((group) => group.id === targetGroup.id
        ? freezeGroup({ ...group, sessionIds: reordered })
        : group);
    return finalize({ ...state, groups, activeGroupId: targetGroup.id });
  }

  let root = state.root;
  let groups = [...state.groups];
  if (sourceGroup.sessionIds.length === 1) {
    const extracted = extractWorkbenchSplitLeaf(root, sourceGroup.id);
    if (!extracted.leaf || !extracted.root) return state;
    root = extracted.root;
    groups = groups.filter((group) => group.id !== sourceGroup.id);
  } else {
    const sourceIndex = sourceGroup.sessionIds.indexOf(sourceSessionId);
    const remaining = sourceGroup.sessionIds.filter((id) => id !== sourceSessionId);
    groups = groups.map((group) => group.id === sourceGroup.id
      ? freezeGroup({
          ...group,
          sessionIds: remaining,
          activeSessionId: group.activeSessionId === sourceSessionId
            ? remaining[Math.min(sourceIndex, remaining.length - 1)]!
            : group.activeSessionId,
        })
      : group);
  }
  groups = groups.map((group) => group.id === targetGroup.id
    ? freezeGroup({
        ...group,
        sessionIds: insertAt(group.sessionIds, sourceSessionId, targetIndex),
        activeSessionId: sourceSessionId,
      })
    : group);
  return finalize({ ...state, groups, root, activeGroupId: targetGroup.id });
}

function moveGroupToEdge(
  state: DesktopTerminalSessionsState,
  action: Extract<DesktopTerminalSessionsAction, { type: "move-group" }>,
): DesktopTerminalSessionsState {
  if (
    !state.root
    || hasLayoutNode(state, action.splitId)
    || !canMoveTerminalGroup(state, action.sourceGroupId, action.targetGroupId)
  ) return state;
  const { direction, placement } = workbenchSplitDefinition(action.edge);
  const moved = moveWorkbenchSplitLeafToEdge(
    state.root,
    action.sourceGroupId,
    action.targetGroupId,
    direction,
    placement,
    action.splitId,
  );
  if (!moved.moved) {
    return state.activeGroupId === action.sourceGroupId
      ? state
      : finalize({ ...state, activeGroupId: action.sourceGroupId });
  }
  return finalize({
    ...state,
    root: moved.root,
    activeGroupId: action.sourceGroupId,
  });
}

function mergeGroupIntoGroup(
  state: DesktopTerminalSessionsState,
  action: Extract<DesktopTerminalSessionsAction, { type: "merge-group" }>,
): DesktopTerminalSessionsState {
  if (
    !state.root
    || !canMergeTerminalGroup(
      state,
      action.sourceGroupId,
      action.targetGroupId,
      action.targetIndex,
    )
  ) return state;
  const sourceGroup = state.groups.find((group) => group.id === action.sourceGroupId)!;
  const extracted = extractWorkbenchSplitLeaf(state.root, sourceGroup.id);
  if (!extracted.leaf || !extracted.root) return state;
  const groups = state.groups
    .filter((group) => group.id !== sourceGroup.id)
    .map((group) => group.id === action.targetGroupId
      ? freezeGroup({
          ...group,
          sessionIds: insertManyAt(
            group.sessionIds,
            sourceGroup.sessionIds,
            action.targetIndex,
          ),
          activeSessionId: sourceGroup.activeSessionId,
        })
      : group);
  return finalize({
    ...state,
    groups,
    root: extracted.root,
    activeGroupId: action.targetGroupId,
  });
}

function insertAt(
  values: readonly string[],
  value: string,
  index: number,
): readonly string[] {
  return [...values.slice(0, index), value, ...values.slice(index)];
}

function insertManyAt(
  values: readonly string[],
  inserted: readonly string[],
  index: number,
): readonly string[] {
  return Object.freeze([
    ...values.slice(0, index),
    ...inserted,
    ...values.slice(index),
  ]);
}

function closeSession(
  state: DesktopTerminalSessionsState,
  sessionId: string,
): DesktopTerminalSessionsState {
  const sessionIndex = state.sessions.findIndex((session) => session.id === sessionId);
  const sourceGroup = findTerminalSessionGroup(state, sessionId);
  if (sessionIndex < 0 || !sourceGroup || !state.root) return state;
  const sessions = state.sessions.filter((session) => session.id !== sessionId);

  if (sourceGroup.sessionIds.length > 1) {
    const closingIndex = sourceGroup.sessionIds.indexOf(sessionId);
    const remaining = sourceGroup.sessionIds.filter((id) => id !== sessionId);
    const activeSessionId = sourceGroup.activeSessionId === sessionId
      ? remaining[Math.min(closingIndex, remaining.length - 1)]!
      : sourceGroup.activeSessionId;
    const groups = state.groups.map((group) => group.id === sourceGroup.id
      ? freezeGroup({ ...group, sessionIds: remaining, activeSessionId })
      : group);
    return finalize({ ...state, sessions, groups });
  }

  const extracted = extractWorkbenchSplitLeaf(state.root, sourceGroup.id);
  if (!extracted.leaf) return state;
  const groups = state.groups.filter((group) => group.id !== sourceGroup.id);
  const root = extracted.root;
  const activeGroupId = state.activeGroupId === sourceGroup.id
    ? getTerminalLayoutGroupIds(root)[0] ?? null
    : state.activeGroupId;
  return finalize({ ...state, sessions, groups, root, activeGroupId });
}

function createSession(
  id: string,
  ordinal: number,
  status: DesktopTerminalSessionStatus = "starting",
  launcherId: DesktopTerminalLauncherId | null = "shell",
): DesktopTerminalSession {
  return Object.freeze({
    id,
    launcherId,
    launchError: null,
    ordinal,
    shell: null,
    status,
  });
}

function createGroup(id: string, sessionId: string): DesktopTerminalGroup {
  return freezeGroup({ id, sessionIds: [sessionId], activeSessionId: sessionId });
}

function createGroupLeaf(groupId: string): DesktopTerminalLayoutLeaf {
  return Object.freeze({ kind: "group", id: groupId, groupId });
}

function freezeGroup(group: DesktopTerminalGroup): DesktopTerminalGroup {
  return Object.freeze({ ...group, sessionIds: Object.freeze([...group.sessionIds]) });
}

function freezeState(
  sessions: readonly DesktopTerminalSession[],
  groups: readonly DesktopTerminalGroup[],
  root: DesktopTerminalLayoutNode | null,
  activeGroupId: string | null,
  nextOrdinal: number,
): DesktopTerminalSessionsState {
  return Object.freeze({
    sessions: Object.freeze([...sessions]),
    groups: Object.freeze([...groups]),
    root,
    activeGroupId,
    nextOrdinal,
  });
}

function finalize(state: DesktopTerminalSessionsState): DesktopTerminalSessionsState {
  const next = freezeState(
    state.sessions,
    state.groups,
    state.root,
    state.activeGroupId,
    state.nextOrdinal,
  );
  if (import.meta.env.DEV) assertDesktopTerminalSessionsState(next);
  return next;
}

function hasSession(state: DesktopTerminalSessionsState, sessionId: string): boolean {
  return state.sessions.some((session) => session.id === sessionId);
}

function hasGroup(state: DesktopTerminalSessionsState, groupId: string): boolean {
  return state.groups.some((group) => group.id === groupId);
}

function hasLayoutNode(state: DesktopTerminalSessionsState, nodeId: string): boolean {
  if (!state.root) return false;
  let found = false;
  visitWorkbenchSplitNodes(state.root, (node) => {
    if (node.id === nodeId) found = true;
  });
  return found;
}
