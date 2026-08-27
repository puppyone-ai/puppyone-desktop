import { describe, expect, it } from "vitest";
import {
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
      { id: "terminal-a", launcherId: "shell", ordinal: 1, status: "starting" },
      { id: "launcher-a", launcherId: null, ordinal: 2, status: "selecting" },
    ]);
    expect(state.activeSessionId).toBe("launcher-a");

    state = desktopTerminalSessionsReducer(state, {
      type: "launch",
      sessionId: "launcher-a",
      launcherId: "codex",
    });
    expect(state.sessions[1]).toMatchObject({
      id: "launcher-a",
      launcherId: "codex",
      ordinal: 2,
      status: "starting",
    });
  });

  it("creates and activates user-owned terminal sessions", () => {
    let state = createDesktopTerminalSessionsState();
    state = desktopTerminalSessionsReducer(state, {
      type: "create",
      sessionId: "terminal-a",
      launcherId: "codex",
    });
    state = desktopTerminalSessionsReducer(state, {
      type: "create",
      sessionId: "terminal-b",
      launcherId: "shell",
    });

    expect(state.sessions).toMatchObject([
      { id: "terminal-a", launcherId: "codex", ordinal: 1, status: "starting" },
      { id: "terminal-b", launcherId: "shell", ordinal: 2, status: "starting" },
    ]);
    expect(state.activeSessionId).toBe("terminal-b");

    state = desktopTerminalSessionsReducer(state, { type: "activate", sessionId: "terminal-a" });
    expect(state.activeSessionId).toBe("terminal-a");
  });

  it("returns a failed startup to the selector with a visible error", () => {
    let state = createDesktopTerminalSessionsState();
    state = desktopTerminalSessionsReducer(state, {
      type: "create-launcher",
      sessionId: "terminal-agent",
    });
    state = desktopTerminalSessionsReducer(state, {
      type: "launch",
      sessionId: "terminal-agent",
      launcherId: "claude",
    });
    state = desktopTerminalSessionsReducer(state, {
      type: "runtime-status",
      sessionId: "terminal-agent",
      status: "error",
      error: "Agent is unavailable",
    });

    expect(state.sessions[0]).toMatchObject({
      id: "terminal-agent",
      launcherId: null,
      launchError: "Agent is unavailable",
      shell: null,
      status: "selecting",
    });
  });

  it("closes only the selected session and chooses a deterministic neighbor", () => {
    let state = createDesktopTerminalSessionsState("terminal-a");
    state = desktopTerminalSessionsReducer(state, {
      type: "create",
      sessionId: "terminal-b",
      launcherId: "shell",
    });
    state = desktopTerminalSessionsReducer(state, {
      type: "create",
      sessionId: "terminal-c",
      launcherId: "shell",
    });
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

  it("keeps renderer-safe session status metadata in state", () => {
    let state = createDesktopTerminalSessionsState("terminal-a");
    state = desktopTerminalSessionsReducer(state, {
      type: "create",
      sessionId: "terminal-b",
      launcherId: "claude",
    });
    state = desktopTerminalSessionsReducer(state, {
      type: "runtime-status",
      sessionId: "terminal-b",
      status: "running",
      shell: "zsh",
    });
    expect(state.sessions).toMatchObject([
      { id: "terminal-a", launcherId: "shell", status: "starting" },
      { id: "terminal-b", launcherId: "claude", shell: "zsh", status: "running" },
    ]);
  });
});
