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
  createDesktopTerminalSessionSnapshot,
  createDesktopTerminalSessionsState,
  createEmptyDesktopTerminalSessionSnapshot,
  desktopTerminalSessionsReducer,
  type DesktopTerminalSessionSnapshot,
} from "../model/terminalSessions";
import type { DesktopTerminalLauncherId } from "../model/terminalLaunchers";
import { TerminalRuntimeRegistry } from "../runtime/terminalRuntimeRegistry";

type UseTerminalSessionsOptions = {
  messageFormatter: MessageFormatter;
  onSessionsChange: (snapshot: DesktopTerminalSessionSnapshot) => void;
  workspacePath: string;
};

export function useTerminalSessions({
  messageFormatter,
  onSessionsChange,
  workspacePath,
}: UseTerminalSessionsOptions) {
  const [state, dispatch] = useReducer(
    desktopTerminalSessionsReducer,
    null,
    createDesktopTerminalSessionsState,
  );
  const [pendingCloseSessionId, setPendingCloseSessionId] = useState<string | null>(null);
  const messageFormatterRef = useRef(messageFormatter);
  const onSessionsChangeRef = useRef(onSessionsChange);
  const snapshotCleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  messageFormatterRef.current = messageFormatter;
  onSessionsChangeRef.current = onSessionsChange;

  const [runtimeRegistry] = useState(() => {
    const registry = new TerminalRuntimeRegistry({
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
    });
    return registry;
  });

  const createSession = useCallback((launcherId: DesktopTerminalLauncherId = "shell") => {
    const sessionId = createTerminalId();
    runtimeRegistry.ensure(sessionId, launcherId);
    dispatch({ type: "create", sessionId, launcherId });
  }, [runtimeRegistry]);

  const createLauncher = useCallback(() => {
    dispatch({ type: "create-launcher", sessionId: createTerminalId() });
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

  const snapshot = useMemo(
    () => createDesktopTerminalSessionSnapshot(workspacePath, state),
    [state, workspacePath],
  );

  useEffect(() => {
    onSessionsChangeRef.current(snapshot);
  }, [snapshot]);

  useEffect(() => {
    state.sessions.forEach((session) => {
      if (session.status === "selecting" && session.launchError) {
        runtimeRegistry.close(session.id);
      }
    });
  }, [runtimeRegistry, state.sessions]);

  useEffect(() => {
    if (snapshotCleanupTimerRef.current !== null) {
      clearTimeout(snapshotCleanupTimerRef.current);
      snapshotCleanupTimerRef.current = null;
    }
    runtimeRegistry.retain();
    return () => {
      runtimeRegistry.release();
      snapshotCleanupTimerRef.current = setTimeout(() => {
        snapshotCleanupTimerRef.current = null;
        onSessionsChangeRef.current(createEmptyDesktopTerminalSessionSnapshot(workspacePath));
      }, 0);
    };
  }, [runtimeRegistry, workspacePath]);

  const pendingCloseSession = state.sessions.find(
    (session) => session.id === pendingCloseSessionId,
  ) ?? null;

  return {
    activeSessionId: state.activeSessionId,
    activateSession,
    cancelCloseSession,
    confirmCloseSession,
    createLauncher,
    createSession,
    launchSession,
    pendingCloseSession,
    requestCloseSession,
    runtimeRegistry,
    sessions: state.sessions,
  };
}

function createTerminalId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `terminal_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
