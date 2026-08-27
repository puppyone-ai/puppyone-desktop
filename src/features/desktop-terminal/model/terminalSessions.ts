import type { DesktopTerminalLauncherId } from "./terminalLaunchers";

export type DesktopTerminalSessionStatus =
  | "selecting"
  | "starting"
  | "running"
  | "exited"
  | "error";

export type DesktopTerminalSessionSummary = {
  id: string;
  launcherId: DesktopTerminalLauncherId | null;
  ordinal: number;
  shell: string | null;
  status: DesktopTerminalSessionStatus;
};

export type DesktopTerminalSession = DesktopTerminalSessionSummary & {
  launchError: string | null;
};

export type DesktopTerminalSessionsState = {
  sessions: DesktopTerminalSession[];
  activeSessionId: string | null;
  nextOrdinal: number;
};

export type DesktopTerminalSessionsAction =
  | { type: "create"; sessionId: string; launcherId: DesktopTerminalLauncherId }
  | { type: "create-launcher"; sessionId: string }
  | { type: "launch"; sessionId: string; launcherId: DesktopTerminalLauncherId }
  | { type: "activate"; sessionId: string }
  | { type: "close"; sessionId: string }
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
  if (!initialSessionId) {
    return {
      sessions: [],
      activeSessionId: null,
      nextOrdinal: 1,
    };
  }

  return {
    sessions: [createSession(initialSessionId, 1, "starting", "shell")],
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
      sessions: [
        ...state.sessions,
        createSession(action.sessionId, state.nextOrdinal, "starting", action.launcherId),
      ],
      activeSessionId: action.sessionId,
      nextOrdinal: state.nextOrdinal + 1,
    };
  }

  if (action.type === "create-launcher") {
    const existing = state.sessions.find((session) => session.status === "selecting");
    if (existing) {
      return state.activeSessionId === existing.id
        ? state
        : { ...state, activeSessionId: existing.id };
    }
    return {
      sessions: [
        ...state.sessions,
        createSession(action.sessionId, state.nextOrdinal, "selecting", null),
      ],
      activeSessionId: action.sessionId,
      nextOrdinal: state.nextOrdinal + 1,
    };
  }

  if (action.type === "launch") {
    let changed = false;
    const sessions = state.sessions.map((session) => {
      if (session.id !== action.sessionId || session.status !== "selecting") return session;
      changed = true;
      return {
        ...session,
        launcherId: action.launcherId,
        launchError: null,
        status: "starting" as const,
      };
    });
    return changed ? { ...state, sessions } : state;
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
      if (action.status === "error" && session.status === "starting") {
        changed = true;
        return {
          ...session,
          launcherId: null,
          launchError: action.error ?? null,
          shell: null,
          status: "selecting" as const,
        };
      }
      const shell = action.shell === undefined ? session.shell : action.shell;
      if (
        session.status === action.status
        && session.shell === shell
        && session.launchError === null
      ) return session;
      changed = true;
      return {
        ...session,
        launchError: null,
        shell,
        status: action.status,
      };
    });
    return changed ? { ...state, sessions } : state;
  }

  return state;
}

function createSession(
  id: string,
  ordinal: number,
  status: DesktopTerminalSessionStatus = "starting",
  launcherId: DesktopTerminalLauncherId | null = "shell",
): DesktopTerminalSession {
  return {
    id,
    launcherId,
    launchError: null,
    ordinal,
    shell: null,
    status,
  };
}
