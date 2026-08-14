import { describe, expect, it } from "vitest";
import {
  createDesktopTerminalSessionSnapshot,
  createDesktopTerminalSessionsState,
  desktopTerminalSessionsReducer,
} from "../src/features/desktop-terminal/model/terminalSessions";

describe("Desktop Terminal session state", () => {
  it("creates one launcher tab and binds the selected runtime in place", () => {
    let state = createDesktopTerminalSessionsState("terminal-a");
    state = desktopTerminalSessionsReducer(state, {
      type: "create-launcher",
      sessionId: "launcher-a",
    });
    state = desktopTerminalSessionsReducer(state, {
      type: "create-launcher",
      sessionId: "launcher-duplicate",
    });

    expect(state.sessions).toMatchObject([
      { id: "terminal-a", ordinal: 1, status: "starting" },
      { id: "launcher-a", ordinal: 2, status: "selecting" },
    ]);
    expect(state.activeSessionId).toBe("launcher-a");

    state = desktopTerminalSessionsReducer(state, { type: "launch", sessionId: "launcher-a" });
    expect(state.sessions[1]).toMatchObject({
      id: "launcher-a",
      ordinal: 2,
      status: "starting",
    });
  });

  it("creates and activates user-owned terminal sessions", () => {
    let state = createDesktopTerminalSessionsState();
    state = desktopTerminalSessionsReducer(state, { type: "create", sessionId: "terminal-a" });
    state = desktopTerminalSessionsReducer(state, { type: "create", sessionId: "terminal-b" });

    expect(state.sessions).toMatchObject([
      { id: "terminal-a", ordinal: 1, status: "starting" },
      { id: "terminal-b", ordinal: 2, status: "starting" },
    ]);
    expect(state.activeSessionId).toBe("terminal-b");

    state = desktopTerminalSessionsReducer(state, { type: "activate", sessionId: "terminal-a" });
    expect(state.activeSessionId).toBe("terminal-a");
  });

  it("closes only the selected session and chooses a deterministic neighbor", () => {
    let state = createDesktopTerminalSessionsState("terminal-a");
    state = desktopTerminalSessionsReducer(state, { type: "create", sessionId: "terminal-b" });
    state = desktopTerminalSessionsReducer(state, { type: "create", sessionId: "terminal-c" });
    state = desktopTerminalSessionsReducer(state, { type: "activate", sessionId: "terminal-b" });
    state = desktopTerminalSessionsReducer(state, { type: "close", sessionId: "terminal-b" });

    expect(state.sessions.map((session) => session.id)).toEqual(["terminal-a", "terminal-c"]);
    expect(state.activeSessionId).toBe("terminal-c");

    state = desktopTerminalSessionsReducer(state, { type: "close", sessionId: "terminal-c" });
    expect(state.activeSessionId).toBe("terminal-a");

    state = desktopTerminalSessionsReducer(state, { type: "close", sessionId: "terminal-a" });
    expect(state.sessions).toEqual([]);
    expect(state.activeSessionId).toBeNull();
  });

  it("publishes renderer-safe session status metadata", () => {
    let state = createDesktopTerminalSessionsState("terminal-a");
    state = desktopTerminalSessionsReducer(state, { type: "create", sessionId: "terminal-b" });
    state = desktopTerminalSessionsReducer(state, {
      type: "runtime-status",
      sessionId: "terminal-b",
      status: "running",
      shell: "zsh",
    });
    expect(state.sessions).toMatchObject([
      { id: "terminal-a", status: "starting" },
      { id: "terminal-b", shell: "zsh", status: "running" },
    ]);
    expect(createDesktopTerminalSessionSnapshot("/workspace", state)).toEqual({
      workspacePath: "/workspace",
      activeSessionId: "terminal-b",
      sessions: [
        { id: "terminal-a", ordinal: 1, shell: null, status: "starting" },
        { id: "terminal-b", ordinal: 2, shell: "zsh", status: "running" },
      ],
    });
  });
});
