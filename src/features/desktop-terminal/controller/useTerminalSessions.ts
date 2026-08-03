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
import { TerminalRuntimeRegistry } from "../runtime/terminalRuntimeRegistry";

type UseTerminalSessionsOptions = {
  initiallyActive: boolean;
  messageFormatter: MessageFormatter;
  onSessionsChange: (snapshot: DesktopTerminalSessionSnapshot) => void;
  workspacePath: string;
};

export function useTerminalSessions({
  initiallyActive,
  messageFormatter,
  onSessionsChange,
  workspacePath,
}: UseTerminalSessionsOptions) {
  const [initialSessionId] = useState(() => (initiallyActive ? createTerminalId() : null));
  const [state, dispatch] = useReducer(
    desktopTerminalSessionsReducer,
    initialSessionId,
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
      onStatus: (sessionId, status, shell) => {
        dispatch({ type: "runtime-status", sessionId, status, shell });
      },
    });
    if (initialSessionId) registry.ensure(initialSessionId);
    return registry;
  });

  const createSession = useCallback(() => {
    const sessionId = createTerminalId();
    runtimeRegistry.ensure(sessionId);
    dispatch({ type: "create", sessionId });
  }, [runtimeRegistry]);

  const activateSession = useCallback((sessionId: string) => {
    dispatch({ type: "activate", sessionId });
  }, []);

  const closeSession = useCallback((sessionId: string) => {
    runtimeRegistry.close(sessionId);
    dispatch({ type: "close", sessionId });
  }, [runtimeRegistry]);

  const requestCloseSession = useCallback((sessionId: string) => {
    setPendingCloseSessionId(sessionId);
  }, []);

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
    createSession,
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
