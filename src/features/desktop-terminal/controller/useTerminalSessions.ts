import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { MessageFormatter } from "@puppyone/localization/core";
import type { WorkbenchSplitDropEdge } from "@puppyone/shared-ui";
import {
  canInsertTerminalSession,
  canMergeTerminalGroup,
  canMoveTerminalGroup,
  canSplitTerminalSession,
  createDesktopTerminalSessionsState,
  desktopTerminalSessionsReducer,
  getActiveTerminalGroup,
  getActiveTerminalSessionId,
  getOrderedTerminalSessions,
  getPresentedTerminalSessionIds,
} from "../model/terminalSessions";
import type { DesktopTerminalLauncherId } from "../model/terminalLaunchers";
import { TerminalRuntimeRegistry } from "../runtime/terminalRuntimeRegistry";

type UseTerminalSessionsOptions = {
  messageFormatter: MessageFormatter;
  workspacePath: string;
};

export function useTerminalSessions({
  messageFormatter,
  workspacePath,
}: UseTerminalSessionsOptions) {
  const [state, dispatch] = useReducer(
    desktopTerminalSessionsReducer,
    null,
    createDesktopTerminalSessionsState,
  );
  const [pendingCloseSessionId, setPendingCloseSessionId] = useState<string | null>(null);
  const messageFormatterRef = useRef(messageFormatter);
  messageFormatterRef.current = messageFormatter;

  const [runtimeRegistry] = useState(() => new TerminalRuntimeRegistry({
    workspacePath,
    getMessageFormatter: () => messageFormatterRef.current,
    onStatus: (sessionId, status, shell, error) => {
      dispatch({
        type: "runtime-status",
        sessionId,
        status,
        shell,
        error: status === "error"
          ? error ?? messageFormatterRef.current("terminal.launcher.agentStartFailed")
          : error,
      });
    },
  }));

  const createSession = useCallback((
    launcherId: DesktopTerminalLauncherId = "shell",
    targetGroupId: string | null = state.activeGroupId,
  ) => {
    const sessionId = createTerminalEntityId("session");
    runtimeRegistry.ensure(sessionId, launcherId);
    dispatch({
      type: "create",
      sessionId,
      groupId: createTerminalEntityId("group"),
      targetGroupId,
      launcherId,
    });
  }, [runtimeRegistry, state.activeGroupId]);

  const createLauncher = useCallback((targetGroupId: string | null = state.activeGroupId) => {
    dispatch({
      type: "create-launcher",
      sessionId: createTerminalEntityId("session"),
      groupId: createTerminalEntityId("group"),
      targetGroupId,
    });
  }, [state.activeGroupId]);

  const launchSession = useCallback((
    sessionId: string,
    launcherId: DesktopTerminalLauncherId,
  ) => {
    runtimeRegistry.ensure(sessionId, launcherId);
    dispatch({ type: "launch", sessionId, launcherId });
  }, [runtimeRegistry]);

  const activateSession = useCallback((sessionId: string) => {
    dispatch({ type: "activate", sessionId });
  }, []);

  const splitSession = useCallback((
    sourceSessionId: string,
    targetGroupId: string,
    edge: WorkbenchSplitDropEdge,
  ) => {
    dispatch({
      type: "split-tab",
      sourceSessionId,
      targetGroupId,
      edge,
      groupId: createTerminalEntityId("group"),
      splitId: createTerminalEntityId("split"),
    });
  }, []);

  const mergeSession = useCallback((
    sourceSessionId: string,
    targetGroupId: string,
    targetIndex: number,
  ) => {
    dispatch({
      type: "merge-tab",
      sourceSessionId,
      targetGroupId,
      targetIndex,
    });
  }, []);

  const moveGroup = useCallback((
    sourceGroupId: string,
    targetGroupId: string,
    edge: WorkbenchSplitDropEdge,
  ) => {
    dispatch({
      type: "move-group",
      sourceGroupId,
      targetGroupId,
      edge,
      splitId: createTerminalEntityId("split"),
    });
  }, []);

  const mergeGroup = useCallback((
    sourceGroupId: string,
    targetGroupId: string,
    targetIndex: number,
  ) => {
    dispatch({ type: "merge-group", sourceGroupId, targetGroupId, targetIndex });
  }, []);

  const resizeSplit = useCallback((splitId: string, ratio: number) => {
    dispatch({ type: "resize-split", splitId, ratio });
  }, []);

  const closeSession = useCallback((sessionId: string) => {
    runtimeRegistry.close(sessionId);
    dispatch({ type: "close", sessionId });
  }, [runtimeRegistry]);

  const requestCloseSession = useCallback((sessionId: string) => {
    const session = state.sessions.find((candidate) => candidate.id === sessionId);
    if (session?.status === "selecting") {
      dispatch({ type: "close", sessionId });
      return;
    }
    setPendingCloseSessionId(sessionId);
  }, [state.sessions]);

  const cancelCloseSession = useCallback(() => {
    setPendingCloseSessionId(null);
  }, []);

  const confirmCloseSession = useCallback(() => {
    if (!pendingCloseSessionId) return;
    closeSession(pendingCloseSessionId);
    setPendingCloseSessionId(null);
  }, [closeSession, pendingCloseSessionId]);

  useEffect(() => {
    state.sessions.forEach((session) => {
      if (session.status === "selecting" && session.launchError) {
        runtimeRegistry.close(session.id);
      }
    });
  }, [runtimeRegistry, state.sessions]);

  useEffect(() => {
    runtimeRegistry.retain();
    return () => runtimeRegistry.release();
  }, [runtimeRegistry]);

  const activeGroup = useMemo(() => getActiveTerminalGroup(state), [state]);
  const activeSessionId = useMemo(() => getActiveTerminalSessionId(state), [state]);
  const presentedSessionIds = useMemo(
    () => getPresentedTerminalSessionIds(state),
    [state],
  );
  const sessions = useMemo(() => getOrderedTerminalSessions(state), [state]);
  const pendingCloseSession = state.sessions.find(
    (session) => session.id === pendingCloseSessionId,
  ) ?? null;

  const sessionCanSplit = useCallback(
    (sessionId: string, targetGroupId: string) => (
      canSplitTerminalSession(state, sessionId, targetGroupId)
    ),
    [state],
  );
  const sessionCanInsert = useCallback(
    (sessionId: string, targetGroupId: string, targetIndex: number) => (
      canInsertTerminalSession(state, sessionId, targetGroupId, targetIndex)
    ),
    [state],
  );
  const groupCanMove = useCallback(
    (sourceGroupId: string, targetGroupId: string) => (
      canMoveTerminalGroup(state, sourceGroupId, targetGroupId)
    ),
    [state],
  );
  const groupCanMerge = useCallback(
    (sourceGroupId: string, targetGroupId: string, targetIndex: number) => (
      canMergeTerminalGroup(state, sourceGroupId, targetGroupId, targetIndex)
    ),
    [state],
  );
  return {
    activeGroup,
    activeSessionId,
    activateSession,
    cancelCloseSession,
    confirmCloseSession,
    createLauncher,
    createSession,
    groups: state.groups,
    groupCanMerge,
    groupCanMove,
    launchSession,
    mergeSession,
    mergeGroup,
    moveGroup,
    pendingCloseSession,
    presentedSessionIds,
    requestCloseSession,
    root: state.root,
    resizeSplit,
    runtimeRegistry,
    sessionCanInsert,
    sessionCanSplit,
    sessions,
    splitSession,
  };
}

function createTerminalEntityId(kind: "group" | "session" | "split") {
  const id = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `terminal-${kind}-${id}`;
}
