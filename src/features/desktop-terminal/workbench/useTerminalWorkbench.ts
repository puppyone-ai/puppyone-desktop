import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { MessageFormatter } from "@puppyone/localization/core";
import {
  auxiliaryWorkbenchReducer,
  canInsertAuxiliaryWorkbenchItem,
  canMergeAuxiliaryWorkbenchGroup,
  canMoveAuxiliaryWorkbenchGroup,
  canSplitAuxiliaryWorkbenchItem,
  createAuxiliaryWorkbenchState,
  getActiveAuxiliaryWorkbenchGroup,
  getActiveAuxiliaryWorkbenchItemId,
  getOrderedAuxiliaryWorkbenchItems,
  getPresentedAuxiliaryWorkbenchItemIds,
  type AuxiliaryWorkbenchItem,
  type WorkbenchSplitDropEdge,
} from "@puppyone/shared-ui";
import type { DesktopTerminalLauncherId } from "../model/terminalLaunchers";
import type {
  DesktopTerminalSession,
  DesktopTerminalSessionStatus,
} from "../model/terminalSessions";
import { TerminalRuntimePool } from "./TerminalRuntimePool";

export const TERMINAL_WORKBENCH_ITEM_KIND = "terminal";
export const AGENT_CHAT_WORKBENCH_ITEM_KIND = "agent-chat";

type TerminalItemState = Readonly<{
  sessions: readonly DesktopTerminalSession[];
  nextOrdinal: number;
}>;

type TerminalItemAction =
  | {
    type: "create";
    itemId: string;
    launcherId: DesktopTerminalLauncherId | null;
    status: "selecting" | "starting";
  }
  | { type: "launch"; itemId: string; launcherId: DesktopTerminalLauncherId }
  | { type: "close"; itemId: string }
  | {
    type: "runtime-status";
    itemId: string;
    status: DesktopTerminalSessionStatus;
    shell?: string | null;
    error?: string | null;
  };

type WorkbenchRoot = Readonly<{
  id: string;
  path: string;
}>;

type UseTerminalWorkbenchOptions = Readonly<{
  messageFormatter: MessageFormatter;
}>;

export function useTerminalWorkbench({ messageFormatter }: UseTerminalWorkbenchOptions) {
  const [topology, dispatchTopology] = useReducer(
    auxiliaryWorkbenchReducer,
    null,
    createAuxiliaryWorkbenchState,
  );
  const [terminalState, dispatchTerminal] = useReducer(terminalItemReducer, {
    sessions: Object.freeze([]),
    nextOrdinal: 1,
  });
  const [pendingCloseItemId, setPendingCloseItemId] = useState<string | null>(null);
  const pendingLauncherByGroupRef = useRef(new Map<string, string>());
  const messageFormatterRef = useRef(messageFormatter);
  const topologyRef = useRef(topology);
  messageFormatterRef.current = messageFormatter;
  topologyRef.current = topology;

  const [runtimeRegistry] = useState(() => new TerminalRuntimePool({
    getMessageFormatter: () => messageFormatterRef.current,
    onStatus: (itemId, status, shell, error) => {
      dispatchTerminal({
        type: "runtime-status",
        itemId,
        status,
        shell,
        error: status === "error"
          ? error ?? messageFormatterRef.current("terminal.launcher.agentStartFailed")
          : error,
      });
    },
  }));

  const resolveTargetGroupId = useCallback((requestedGroupId: string | null) => {
    const latest = topologyRef.current;
    return latest.groups.some((group) => group.id === requestedGroupId)
      ? requestedGroupId
      : latest.activeGroupId;
  }, []);

  const reserveContributionItem = useCallback((
    kind: string,
    root: WorkbenchRoot,
  ): AuxiliaryWorkbenchItem => Object.freeze({
    id: createWorkbenchEntityId("item"),
    kind,
    rootId: root.path,
    contextId: root.id,
  }), []);

  const commitContributionItem = useCallback((
    item: AuxiliaryWorkbenchItem,
    targetGroupId: string | null = null,
  ) => {
    dispatchTopology({
      type: "create",
      item,
      groupId: createWorkbenchEntityId("group"),
      targetGroupId: resolveTargetGroupId(targetGroupId),
    });
    return item.id;
  }, [resolveTargetGroupId]);

  const insertItem = useCallback((
    kind: string,
    root: WorkbenchRoot,
    targetGroupId: string | null = null,
  ) => commitContributionItem(
    reserveContributionItem(kind, root),
    targetGroupId,
  ), [commitContributionItem, reserveContributionItem]);

  const createTerminal = useCallback((
    root: WorkbenchRoot,
    launcherId: DesktopTerminalLauncherId = "shell",
    targetGroupId: string | null = null,
  ) => {
    const itemId = insertItem(TERMINAL_WORKBENCH_ITEM_KIND, root, targetGroupId);
    runtimeRegistry.ensure(itemId, launcherId, root.path);
    dispatchTerminal({ type: "create", itemId, launcherId, status: "starting" });
    return itemId;
  }, [insertItem, runtimeRegistry]);

  const createTerminalLauncher = useCallback((
    root: WorkbenchRoot,
    targetGroupId: string | null = null,
  ) => {
    const resolvedTargetGroupId = resolveTargetGroupId(targetGroupId);
    const pendingKey = resolvedTargetGroupId ?? "__empty-workbench__";
    const pendingItemId = pendingLauncherByGroupRef.current.get(pendingKey);
    if (pendingItemId) {
      dispatchTopology({ type: "activate", itemId: pendingItemId });
      return pendingItemId;
    }
    const targetGroup = topologyRef.current.groups.find(
      (group) => group.id === resolvedTargetGroupId,
    );
    const existingItemId = targetGroup?.itemIds.find((itemId) => (
      terminalState.sessions.some((session) => (
        session.id === itemId && session.status === "selecting"
      ))
    ));
    if (existingItemId) {
      pendingLauncherByGroupRef.current.set(pendingKey, existingItemId);
      dispatchTopology({ type: "activate", itemId: existingItemId });
      return existingItemId;
    }
    const itemId = insertItem(TERMINAL_WORKBENCH_ITEM_KIND, root, resolvedTargetGroupId);
    pendingLauncherByGroupRef.current.set(pendingKey, itemId);
    dispatchTerminal({ type: "create", itemId, launcherId: null, status: "selecting" });
    return itemId;
  }, [insertItem, resolveTargetGroupId, terminalState.sessions]);

  const launchTerminal = useCallback((
    itemId: string,
    launcherId: DesktopTerminalLauncherId,
  ) => {
    const item = topology.items.find((candidate) => candidate.id === itemId);
    if (!item || item.kind !== TERMINAL_WORKBENCH_ITEM_KIND) return;
    for (const [groupId, pendingItemId] of pendingLauncherByGroupRef.current) {
      if (pendingItemId === itemId) pendingLauncherByGroupRef.current.delete(groupId);
    }
    runtimeRegistry.ensure(itemId, launcherId, item.rootId);
    dispatchTerminal({ type: "launch", itemId, launcherId });
  }, [runtimeRegistry, topology.items]);

  const activateItem = useCallback((itemId: string) => {
    dispatchTopology({ type: "activate", itemId });
  }, []);

  const removeItem = useCallback((itemId: string) => {
    dispatchTopology({ type: "close", itemId });
  }, []);

  const closeTerminal = useCallback((itemId: string) => {
    runtimeRegistry.close(itemId);
    dispatchTerminal({ type: "close", itemId });
    removeItem(itemId);
  }, [removeItem, runtimeRegistry]);

  const requestCloseTerminal = useCallback((itemId: string) => {
    const session = terminalState.sessions.find((candidate) => candidate.id === itemId);
    if (!session) return;
    if (session.status === "selecting") {
      closeTerminal(itemId);
      return;
    }
    setPendingCloseItemId(itemId);
  }, [closeTerminal, terminalState.sessions]);

  const cancelCloseTerminal = useCallback(() => setPendingCloseItemId(null), []);
  const confirmCloseTerminal = useCallback(() => {
    if (!pendingCloseItemId) return;
    closeTerminal(pendingCloseItemId);
    setPendingCloseItemId(null);
  }, [closeTerminal, pendingCloseItemId]);

  const splitItem = useCallback((
    sourceItemId: string,
    targetGroupId: string,
    edge: WorkbenchSplitDropEdge,
  ) => {
    dispatchTopology({
      type: "split-item",
      sourceItemId,
      targetGroupId,
      edge,
      groupId: createWorkbenchEntityId("group"),
      splitId: createWorkbenchEntityId("split"),
    });
  }, []);

  const mergeItem = useCallback((
    sourceItemId: string,
    targetGroupId: string,
    targetIndex: number,
  ) => dispatchTopology({
    type: "merge-item",
    sourceItemId,
    targetGroupId,
    targetIndex,
  }), []);

  const moveGroup = useCallback((
    sourceGroupId: string,
    targetGroupId: string,
    edge: WorkbenchSplitDropEdge,
  ) => dispatchTopology({
    type: "move-group",
    sourceGroupId,
    targetGroupId,
    edge,
    splitId: createWorkbenchEntityId("split"),
  }), []);

  const mergeGroup = useCallback((
    sourceGroupId: string,
    targetGroupId: string,
    targetIndex: number,
  ) => dispatchTopology({
    type: "merge-group",
    sourceGroupId,
    targetGroupId,
    targetIndex,
  }), []);

  const resizeSplit = useCallback((splitId: string, ratio: number) => {
    dispatchTopology({ type: "resize-split", splitId, ratio });
  }, []);

  useEffect(() => {
    terminalState.sessions.forEach((session) => {
      if (session.status === "selecting" && session.launchError) {
        runtimeRegistry.close(session.id);
      }
    });
  }, [runtimeRegistry, terminalState.sessions]);

  useEffect(() => {
    const selectingIds = new Set(terminalState.sessions.flatMap((session) => (
      session.status === "selecting" ? [session.id] : []
    )));
    for (const [groupId, itemId] of pendingLauncherByGroupRef.current) {
      if (!selectingIds.has(itemId)) pendingLauncherByGroupRef.current.delete(groupId);
    }
  }, [terminalState.sessions]);

  useEffect(() => {
    runtimeRegistry.retain();
    return () => runtimeRegistry.release();
  }, [runtimeRegistry]);

  const activeGroup = useMemo(
    () => getActiveAuxiliaryWorkbenchGroup(topology),
    [topology],
  );
  const activeItemId = useMemo(
    () => getActiveAuxiliaryWorkbenchItemId(topology),
    [topology],
  );
  const presentedItemIds = useMemo(
    () => getPresentedAuxiliaryWorkbenchItemIds(topology),
    [topology],
  );
  const items = useMemo(() => getOrderedAuxiliaryWorkbenchItems(topology), [topology]);
  const terminalById = useMemo(
    () => new Map(terminalState.sessions.map((session) => [session.id, session])),
    [terminalState.sessions],
  );
  const pendingCloseTerminal = pendingCloseItemId
    ? terminalById.get(pendingCloseItemId) ?? null
    : null;
  const groupCanMerge = useCallback((
    sourceGroupId: string,
    targetGroupId: string,
    targetIndex: number,
  ) => canMergeAuxiliaryWorkbenchGroup(
    topology,
    sourceGroupId,
    targetGroupId,
    targetIndex,
  ), [topology]);
  const groupCanMove = useCallback((sourceGroupId: string, targetGroupId: string) => (
    canMoveAuxiliaryWorkbenchGroup(topology, sourceGroupId, targetGroupId)
  ), [topology]);
  const itemCanInsert = useCallback((
    itemId: string,
    targetGroupId: string,
    targetIndex: number,
  ) => canInsertAuxiliaryWorkbenchItem(topology, itemId, targetGroupId, targetIndex), [topology]);
  const itemCanSplit = useCallback((itemId: string, targetGroupId: string) => (
    canSplitAuxiliaryWorkbenchItem(topology, itemId, targetGroupId)
  ), [topology]);

  return {
    activeGroup,
    activeItemId,
    activateItem,
    cancelCloseTerminal,
    confirmCloseTerminal,
    createTerminal,
    createTerminalLauncher,
    groups: topology.groups,
    groupCanMerge,
    groupCanMove,
    itemCanInsert,
    itemCanSplit,
    items,
    launchTerminal,
    mergeGroup,
    mergeItem,
    moveGroup,
    pendingCloseTerminal,
    presentedItemIds,
    removeItem,
    reserveContributionItem,
    commitContributionItem,
    requestCloseTerminal,
    resizeSplit,
    root: topology.root,
    runtimeRegistry,
    splitItem,
    terminalById,
  };
}

function terminalItemReducer(
  state: TerminalItemState,
  action: TerminalItemAction,
): TerminalItemState {
  if (action.type === "create") {
    if (state.sessions.some((session) => session.id === action.itemId)) return state;
    const session = Object.freeze({
      id: action.itemId,
      launcherId: action.launcherId,
      launchError: null,
      ordinal: state.nextOrdinal,
      shell: null,
      status: action.status,
    });
    return freezeTerminalItemState([...state.sessions, session], state.nextOrdinal + 1);
  }
  if (action.type === "launch") {
    let changed = false;
    const sessions = state.sessions.map((session) => {
      if (session.id !== action.itemId || session.status !== "selecting") return session;
      changed = true;
      return Object.freeze({
        ...session,
        launcherId: action.launcherId,
        launchError: null,
        status: "starting" as const,
      });
    });
    return changed ? freezeTerminalItemState(sessions, state.nextOrdinal) : state;
  }
  if (action.type === "close") {
    const sessions = state.sessions.filter((session) => session.id !== action.itemId);
    return sessions.length === state.sessions.length
      ? state
      : freezeTerminalItemState(sessions, state.nextOrdinal);
  }
  if (action.type === "runtime-status") {
    let changed = false;
    const sessions = state.sessions.map((session) => {
      if (session.id !== action.itemId) return session;
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
    return changed ? freezeTerminalItemState(sessions, state.nextOrdinal) : state;
  }
  return state;
}

function freezeTerminalItemState(
  sessions: readonly DesktopTerminalSession[],
  nextOrdinal: number,
): TerminalItemState {
  return Object.freeze({ sessions: Object.freeze([...sessions]), nextOrdinal });
}

function createWorkbenchEntityId(kind: "group" | "item" | "split") {
  const id = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `terminal-workbench-${kind}-${id}`;
}
