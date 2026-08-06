export type DesktopTerminalSessionStatus = "starting" | "running" | "exited" | "error";

export type DesktopTerminalSessionSummary = {
  id: string;
  ordinal: number;
  shell: string | null;
  status: DesktopTerminalSessionStatus;
};

export type DesktopTerminalSessionSnapshot = {
  workspacePath: string;
  sessions: DesktopTerminalSessionSummary[];
  activeSessionId: string | null;
};

export type DesktopTerminalSession = DesktopTerminalSessionSummary;

export type DesktopTerminalSessionsState = {
  sessions: DesktopTerminalSession[];
  activeSessionId: string | null;
  nextOrdinal: number;
};

export type DesktopTerminalSessionsAction =
  | { type: "create"; sessionId: string }
  | { type: "activate"; sessionId: string }
  | { type: "close"; sessionId: string }
  | {
    type: "runtime-status";
    sessionId: string;
    status: DesktopTerminalSessionStatus;
    shell?: string | null;
  };

export function createDesktopTerminalSessionsState(
  initialSessionId: string | null = null,
): DesktopTerminalSessionsState {
  if (!initialSessionId) {
    return {
      sessions: [],
      activeSessionId: null,
      nextOrdinal: 1,
    };
  }

  return {
    sessions: [createSession(initialSessionId, 1)],
    activeSessionId: initialSessionId,
    nextOrdinal: 2,
  };
}

export function desktopTerminalSessionsReducer(
  state: DesktopTerminalSessionsState,
  action: DesktopTerminalSessionsAction,
): DesktopTerminalSessionsState {
  if (action.type === "create") {
    if (state.sessions.some((session) => session.id === action.sessionId)) return state;
    return {
      sessions: [...state.sessions, createSession(action.sessionId, state.nextOrdinal)],
      activeSessionId: action.sessionId,
      nextOrdinal: state.nextOrdinal + 1,
    };
  }

  if (action.type === "activate") {
    if (state.activeSessionId === action.sessionId) return state;
    if (!state.sessions.some((session) => session.id === action.sessionId)) return state;
    return {
      ...state,
      activeSessionId: action.sessionId,
    };
  }

  if (action.type === "close") {
    const closingIndex = state.sessions.findIndex((session) => session.id === action.sessionId);
    if (closingIndex < 0) return state;
    const sessions = state.sessions.filter((session) => session.id !== action.sessionId);
    if (state.activeSessionId !== action.sessionId) {
      return {
        ...state,
        sessions,
      };
    }
    const replacementIndex = Math.min(closingIndex, sessions.length - 1);
    return {
      ...state,
      sessions,
      activeSessionId: replacementIndex >= 0 ? sessions[replacementIndex].id : null,
    };
  }

  if (action.type === "runtime-status") {
    let changed = false;
    const sessions = state.sessions.map((session) => {
      if (session.id !== action.sessionId) return session;
      const shell = action.shell === undefined ? session.shell : action.shell;
      if (session.status === action.status && session.shell === shell) return session;
      changed = true;
      return {
        ...session,
        shell,
        status: action.status,
      };
    });
    return changed ? { ...state, sessions } : state;
  }

  return state;
}

export function createDesktopTerminalSessionSnapshot(
  workspacePath: string,
  state: DesktopTerminalSessionsState,
): DesktopTerminalSessionSnapshot {
  return {
    workspacePath,
    sessions: state.sessions.map(({ id, ordinal, shell, status }) => ({
      id,
      ordinal,
      shell,
      status,
    })),
    activeSessionId: state.activeSessionId,
  };
}

export function createEmptyDesktopTerminalSessionSnapshot(
  workspacePath = "",
): DesktopTerminalSessionSnapshot {
  return {
    workspacePath,
    sessions: [],
    activeSessionId: null,
  };
}

function createSession(id: string, ordinal: number): DesktopTerminalSession {
  return {
    id,
    ordinal,
    shell: null,
    status: "starting",
  };
}
