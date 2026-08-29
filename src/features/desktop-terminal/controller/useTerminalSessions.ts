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
  workbenchSplitDefinition,
  type WorkbenchSplitDropEdge,
} from "@puppyone/shared-ui";
import {
  canUnsplitTerminalSession,
  createDesktopTerminalSessionsState,
  desktopTerminalSessionsReducer,
  getActiveTerminalGroup,
  getActiveTerminalSessionId,
  getOrderedTerminalSessions,
  getTerminalGroupSessionIds,
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

  const createSession = useCallback((launcherId: DesktopTerminalLauncherId = "shell") => {
    const sessionId = createTerminalEntityId("session");
    runtimeRegistry.ensure(sessionId, launcherId);
    dispatch({
      type: "create",
      sessionId,
      groupId: createTerminalEntityId("group"),
      launcherId,
    });
  }, [runtimeRegistry]);

  const createLauncher = useCallback(() => {
    dispatch({
      type: "create-launcher",
      sessionId: createTerminalEntityId("session"),
      groupId: createTerminalEntityId("group"),
    });
  }, []);

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

  const moveSession = useCallback((
    sourceSessionId: string,
    targetSessionId: string,
    edge: WorkbenchSplitDropEdge,
  ) => {
    const { direction, placement } = workbenchSplitDefinition(edge);
    dispatch({
      type: "move",
      sourceSessionId,
      targetSessionId,
      direction,
      placement,
      splitId: createTerminalEntityId("split"),
    });
  }, []);

  const unsplitSession = useCallback((sessionId: string) => {
    dispatch({
      type: "unsplit",
      sessionId,
      groupId: createTerminalEntityId("group"),
    });
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
    () => activeGroup ? getTerminalGroupSessionIds(activeGroup) : [],
    [activeGroup],
  );
  const sessions = useMemo(() => getOrderedTerminalSessions(state), [state]);
  const pendingCloseSession = state.sessions.find(
    (session) => session.id === pendingCloseSessionId,
  ) ?? null;

  const sessionCanUnsplit = useCallback(
    (sessionId: string) => canUnsplitTerminalSession(state, sessionId),
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
    launchSession,
    moveSession,
    pendingCloseSession,
    presentedSessionIds,
    requestCloseSession,
    resizeSplit,
    runtimeRegistry,
    sessionCanUnsplit,
    sessions,
    unsplitSession,
  };
}

function createTerminalEntityId(kind: "group" | "session" | "split") {
  const id = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `terminal-${kind}-${id}`;
}
