import {
  collectWorkbenchSplitLeaves,
  createWorkbenchSplit,
  extractWorkbenchSplitLeaf,
  findWorkbenchSplitLeaf,
  insertWorkbenchSplitLeafAtEdge,
  isWorkbenchSplit,
  moveWorkbenchSplitLeafToEdge,
  updateWorkbenchSplitRatio,
  visitWorkbenchSplitNodes,
  type WorkbenchSplit,
  type WorkbenchSplitDirection,
  type WorkbenchSplitLeaf,
  type WorkbenchSplitNode,
  type WorkbenchSplitPlacement,
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

export type DesktopTerminalLayoutLeaf = WorkbenchSplitLeaf<"session", {
  sessionId: string;
}>;
export type DesktopTerminalLayoutSplit = WorkbenchSplit<DesktopTerminalLayoutLeaf>;
export type DesktopTerminalLayoutNode = WorkbenchSplitNode<DesktopTerminalLayoutLeaf>;

export type DesktopTerminalGroup = Readonly<{
  id: string;
  root: DesktopTerminalLayoutNode;
  focusedSessionId: string;
}>;

export type DesktopTerminalSessionsState = Readonly<{
  sessions: readonly DesktopTerminalSession[];
  groups: readonly DesktopTerminalGroup[];
  activeGroupId: string | null;
  nextOrdinal: number;
}>;

export type DesktopTerminalSessionsAction =
  | {
    type: "create";
    sessionId: string;
    groupId: string;
    launcherId: DesktopTerminalLauncherId;
  }
  | { type: "create-launcher"; sessionId: string; groupId: string }
  | { type: "launch"; sessionId: string; launcherId: DesktopTerminalLauncherId }
  | { type: "activate"; sessionId: string }
  | { type: "close"; sessionId: string }
  | {
    type: "move";
    sourceSessionId: string;
    targetSessionId: string;
    direction: WorkbenchSplitDirection;
    placement: WorkbenchSplitPlacement;
    splitId: string;
  }
  | { type: "unsplit"; sessionId: string; groupId: string }
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
  if (!initialSessionId) return freezeState([], [], null, 1);
  const session = createSession(initialSessionId, 1, "starting", "shell");
  const group = createGroup(`terminal-group-${initialSessionId}`, session.id);
  return freezeState([session], [group], group.id, 2);
}

export function desktopTerminalSessionsReducer(
  state: DesktopTerminalSessionsState,
  action: DesktopTerminalSessionsAction,
): DesktopTerminalSessionsState {
  if (action.type === "create") {
    if (hasSession(state, action.sessionId) || hasGroup(state, action.groupId)) return state;
    const session = createSession(
      action.sessionId,
      state.nextOrdinal,
      "starting",
      action.launcherId,
    );
    const group = createGroup(action.groupId, action.sessionId);
    return finalize({
      ...state,
      sessions: [...state.sessions, session],
      groups: [...state.groups, group],
      activeGroupId: group.id,
      nextOrdinal: state.nextOrdinal + 1,
    });
  }

  if (action.type === "create-launcher") {
    const existing = state.sessions.find((session) => session.status === "selecting");
    if (existing) return activateSession(state, existing.id);
    if (hasSession(state, action.sessionId) || hasGroup(state, action.groupId)) return state;
    const session = createSession(action.sessionId, state.nextOrdinal, "selecting", null);
    const group = createGroup(action.groupId, action.sessionId);
    return finalize({
      ...state,
      sessions: [...state.sessions, session],
      groups: [...state.groups, group],
      activeGroupId: group.id,
      nextOrdinal: state.nextOrdinal + 1,
    });
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

  if (action.type === "move") {
    return moveSession(state, action);
  }

  if (action.type === "unsplit") {
    return unsplitSession(state, action.sessionId, action.groupId);
  }

  if (action.type === "resize-split") {
    const ratio = clampTerminalSplitRatio(action.ratio);
    let changed = false;
    const groups = state.groups.map((group) => {
      const root = updateWorkbenchSplitRatio(group.root, action.splitId, ratio);
      if (root === group.root) return group;
      changed = true;
      return freezeGroup({ ...group, root });
    });
    return changed ? finalize({ ...state, groups }) : state;
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
  return getActiveTerminalGroup(state)?.focusedSessionId ?? null;
}

export function findTerminalSessionGroup(
  state: DesktopTerminalSessionsState,
  sessionId: string,
): DesktopTerminalGroup | null {
  return state.groups.find((group) => Boolean(findWorkbenchSplitLeaf(group.root, sessionId)))
    ?? null;
}

export function getTerminalGroupSessionIds(group: DesktopTerminalGroup): readonly string[] {
  return Object.freeze(
    collectWorkbenchSplitLeaves(group.root).map((leaf) => leaf.sessionId),
  );
}

export function getOrderedTerminalSessions(
  state: DesktopTerminalSessionsState,
): readonly DesktopTerminalSession[] {
  const sessionById = new Map(state.sessions.map((session) => [session.id, session]));
  return Object.freeze(state.groups.flatMap((group) => (
    getTerminalGroupSessionIds(group)
      .map((sessionId) => sessionById.get(sessionId))
      .filter((session): session is DesktopTerminalSession => Boolean(session))
  )));
}

export function canUnsplitTerminalSession(
  state: DesktopTerminalSessionsState,
  sessionId: string,
): boolean {
  const group = findTerminalSessionGroup(state, sessionId);
  return Boolean(group && isWorkbenchSplit(group.root));
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
  const nodeIds = new Set<string>();
  const ownedSessionIds = new Set<string>();
  for (const group of state.groups) {
    if (!group.id || groupIds.has(group.id)) errors.push(`duplicate Group ${group.id}`);
    groupIds.add(group.id);
    const leaves = collectWorkbenchSplitLeaves(group.root);
    if (leaves.length === 0) errors.push(`empty Group ${group.id}`);
    if (!leaves.some((leaf) => leaf.sessionId === group.focusedSessionId)) {
      errors.push(`Group ${group.id} focus is outside its tree`);
    }
    visitWorkbenchSplitNodes(group.root, (node) => {
      if (!node.id || nodeIds.has(node.id)) errors.push(`duplicate layout node ${node.id}`);
      nodeIds.add(node.id);
      if (isWorkbenchSplit(node)) return;
      if (node.id !== node.sessionId) errors.push(`leaf identity mismatch ${node.id}`);
      if (!sessionIds.has(node.sessionId)) errors.push(`missing Session ${node.sessionId}`);
      if (ownedSessionIds.has(node.sessionId)) errors.push(`Session ${node.sessionId} has two owners`);
      ownedSessionIds.add(node.sessionId);
    });
  }
  for (const sessionId of sessionIds) {
    if (!ownedSessionIds.has(sessionId)) errors.push(`Session ${sessionId} has no Group`);
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

function activateSession(
  state: DesktopTerminalSessionsState,
  sessionId: string,
): DesktopTerminalSessionsState {
  const owner = findTerminalSessionGroup(state, sessionId);
  if (!owner) return state;
  const ownerChanged = owner.focusedSessionId !== sessionId;
  const activeChanged = state.activeGroupId !== owner.id;
  if (!ownerChanged && !activeChanged) return state;
  const groups = ownerChanged
    ? state.groups.map((group) => (
        group.id === owner.id ? freezeGroup({ ...group, focusedSessionId: sessionId }) : group
      ))
    : state.groups;
  return finalize({ ...state, groups, activeGroupId: owner.id });
}

function moveSession(
  state: DesktopTerminalSessionsState,
  action: Extract<DesktopTerminalSessionsAction, { type: "move" }>,
): DesktopTerminalSessionsState {
  if (action.sourceSessionId === action.targetSessionId) return state;
  if (hasLayoutNode(state, action.splitId)) return state;
  const sourceGroup = findTerminalSessionGroup(state, action.sourceSessionId);
  const targetGroup = findTerminalSessionGroup(state, action.targetSessionId);
  if (!sourceGroup || !targetGroup) return state;

  if (sourceGroup.id === targetGroup.id) {
    const result = moveWorkbenchSplitLeafToEdge(
      sourceGroup.root,
      action.sourceSessionId,
      action.targetSessionId,
      action.direction,
      action.placement,
      action.splitId,
    );
    if (!result.moved && sourceGroup.focusedSessionId === action.sourceSessionId) return state;
    const groups = state.groups.map((group) => (
      group.id === sourceGroup.id
        ? freezeGroup({
            ...group,
            root: result.root,
            focusedSessionId: action.sourceSessionId,
          })
        : group
    ));
    return finalize({ ...state, groups, activeGroupId: sourceGroup.id });
  }

  const extracted = extractWorkbenchSplitLeaf(sourceGroup.root, action.sourceSessionId);
  if (!extracted.leaf) return state;
  const targetRoot = insertWorkbenchSplitLeafAtEdge(
    targetGroup.root,
    action.targetSessionId,
    extracted.leaf,
    action.direction,
    action.placement,
    action.splitId,
  );
  if (targetRoot === targetGroup.root) return state;

  const groups: DesktopTerminalGroup[] = [];
  for (const group of state.groups) {
    if (group.id === sourceGroup.id) {
      if (!extracted.root) continue;
      const remainingIds = collectWorkbenchSplitLeaves(extracted.root).map((leaf) => leaf.sessionId);
      groups.push(freezeGroup({
        ...group,
        root: extracted.root,
        focusedSessionId: remainingIds.includes(group.focusedSessionId)
          ? group.focusedSessionId
          : remainingIds[0]!,
      }));
      continue;
    }
    if (group.id === targetGroup.id) {
      groups.push(freezeGroup({
        ...group,
        root: targetRoot,
        focusedSessionId: action.sourceSessionId,
      }));
      continue;
    }
    groups.push(group);
  }
  return finalize({ ...state, groups, activeGroupId: targetGroup.id });
}

function unsplitSession(
  state: DesktopTerminalSessionsState,
  sessionId: string,
  nextGroupId: string,
): DesktopTerminalSessionsState {
  if (hasGroup(state, nextGroupId)) return state;
  const sourceGroup = findTerminalSessionGroup(state, sessionId);
  if (!sourceGroup || !isWorkbenchSplit(sourceGroup.root)) return state;
  const extracted = extractWorkbenchSplitLeaf(sourceGroup.root, sessionId);
  if (!extracted.root || !extracted.leaf) return state;
  const remainingIds = collectWorkbenchSplitLeaves(extracted.root).map((leaf) => leaf.sessionId);
  const sourceIndex = state.groups.indexOf(sourceGroup);
  const nextGroup = freezeGroup({
    id: nextGroupId,
    root: extracted.leaf,
    focusedSessionId: sessionId,
  });
  const groups = [...state.groups];
  groups.splice(
    sourceIndex,
    1,
    freezeGroup({
      ...sourceGroup,
      root: extracted.root,
      focusedSessionId: remainingIds.includes(sourceGroup.focusedSessionId)
        ? sourceGroup.focusedSessionId
        : remainingIds[0]!,
    }),
    nextGroup,
  );
  return finalize({ ...state, groups, activeGroupId: nextGroupId });
}

function closeSession(
  state: DesktopTerminalSessionsState,
  sessionId: string,
): DesktopTerminalSessionsState {
  const sessionIndex = state.sessions.findIndex((session) => session.id === sessionId);
  const sourceGroup = findTerminalSessionGroup(state, sessionId);
  if (sessionIndex < 0 || !sourceGroup) return state;
  const sessions = state.sessions.filter((session) => session.id !== sessionId);
  const sourceGroupIndex = state.groups.indexOf(sourceGroup);
  const oldGroupSessionIds = getTerminalGroupSessionIds(sourceGroup);
  const closingLeafIndex = oldGroupSessionIds.indexOf(sessionId);
  const extracted = extractWorkbenchSplitLeaf(sourceGroup.root, sessionId);
  if (!extracted.leaf) return state;

  let groups: DesktopTerminalGroup[];
  let activeGroupId = state.activeGroupId;
  if (!extracted.root) {
    groups = state.groups.filter((group) => group.id !== sourceGroup.id);
    if (activeGroupId === sourceGroup.id) {
      const replacementIndex = Math.min(sourceGroupIndex, groups.length - 1);
      activeGroupId = replacementIndex >= 0 ? groups[replacementIndex]!.id : null;
    }
  } else {
    const remainingIds = collectWorkbenchSplitLeaves(extracted.root).map((leaf) => leaf.sessionId);
    const replacementIndex = Math.min(closingLeafIndex, remainingIds.length - 1);
    const focusedSessionId = sourceGroup.focusedSessionId === sessionId
      ? remainingIds[replacementIndex]!
      : sourceGroup.focusedSessionId;
    groups = state.groups.map((group) => (
      group.id === sourceGroup.id
        ? freezeGroup({ ...group, root: extracted.root!, focusedSessionId })
        : group
    ));
  }
  return finalize({ ...state, sessions, groups, activeGroupId });
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

function createLeaf(sessionId: string): DesktopTerminalLayoutLeaf {
  return Object.freeze({ kind: "session", id: sessionId, sessionId });
}

function createGroup(id: string, sessionId: string): DesktopTerminalGroup {
  return freezeGroup({ id, root: createLeaf(sessionId), focusedSessionId: sessionId });
}

function freezeGroup(group: DesktopTerminalGroup): DesktopTerminalGroup {
  return Object.freeze(group);
}

function freezeState(
  sessions: readonly DesktopTerminalSession[],
  groups: readonly DesktopTerminalGroup[],
  activeGroupId: string | null,
  nextOrdinal: number,
): DesktopTerminalSessionsState {
  return Object.freeze({
    sessions: Object.freeze([...sessions]),
    groups: Object.freeze([...groups]),
    activeGroupId,
    nextOrdinal,
  });
}

function finalize(state: DesktopTerminalSessionsState): DesktopTerminalSessionsState {
  const next = freezeState(state.sessions, state.groups, state.activeGroupId, state.nextOrdinal);
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
  let found = false;
  for (const group of state.groups) {
    visitWorkbenchSplitNodes(group.root, (node) => {
      if (node.id === nodeId) found = true;
    });
  }
  return found;
}
