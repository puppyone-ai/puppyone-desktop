import { describe, expect, it } from "vitest";
import {
  assertDesktopTerminalSessionsState,
  createDesktopTerminalSessionsState,
  desktopTerminalSessionsReducer,
  desktopTerminalSessionsStateErrors,
  findTerminalSessionGroup,
  getActiveTerminalGroup,
  getActiveTerminalSessionId,
  getOrderedTerminalSessions,
  getTerminalGroupSessionIds,
  type DesktopTerminalSessionsState,
} from "../src/features/desktop-terminal/model/terminalSessions";

describe("Desktop Terminal Session Groups", () => {
  it("creates one standalone Group per new Session and deduplicates the launcher", () => {
    let state = createDesktopTerminalSessionsState("terminal-a");
    state = desktopTerminalSessionsReducer(state, {
      type: "create-launcher",
      sessionId: "launcher-a",
      groupId: "group-launcher-a",
    });
    state = desktopTerminalSessionsReducer(state, {
      type: "create-launcher",
      sessionId: "launcher-duplicate",
      groupId: "group-launcher-duplicate",
    });

    expect(state.sessions).toMatchObject([
      { id: "terminal-a", launcherId: "shell", ordinal: 1, status: "starting" },
      { id: "launcher-a", launcherId: null, ordinal: 2, status: "selecting" },
    ]);
    expect(state.groups).toHaveLength(2);
    expect(getActiveTerminalSessionId(state)).toBe("launcher-a");
    expect(getTerminalGroupSessionIds(state.groups[1]!)).toEqual(["launcher-a"]);

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
    assertDesktopTerminalSessionsState(state);
  });

  it("moves an existing Session across Groups without changing Session identity", () => {
    let state = createThreeSessions();
    const sessionsBefore = new Map(state.sessions.map((session) => [session.id, session]));

    state = move(state, "terminal-c", "terminal-a", "horizontal", "second", "split-a-c");

    expect(state.groups).toHaveLength(2);
    expect(getActiveTerminalSessionId(state)).toBe("terminal-c");
    expect(getTerminalGroupSessionIds(getActiveTerminalGroup(state)!)).toEqual([
      "terminal-a",
      "terminal-c",
    ]);
    expect(findTerminalSessionGroup(state, "terminal-c")?.id)
      .toBe(findTerminalSessionGroup(state, "terminal-a")?.id);
    expect(state.sessions.find(({ id }) => id === "terminal-c"))
      .toBe(sessionsBefore.get("terminal-c"));
    expect(getOrderedTerminalSessions(state).map(({ id }) => id)).toEqual([
      "terminal-a",
      "terminal-c",
      "terminal-b",
    ]);
    expect(desktopTerminalSessionsStateErrors(state)).toEqual([]);
  });

  it("supports nested horizontal and vertical movement inside one Group", () => {
    let state = createThreeSessions();
    state = move(state, "terminal-b", "terminal-a", "horizontal", "second", "split-a-b");
    state = move(state, "terminal-c", "terminal-b", "vertical", "second", "split-b-c");

    const group = getActiveTerminalGroup(state)!;
    expect(group.root).toMatchObject({
      kind: "split",
      id: "split-a-b",
      direction: "horizontal",
      first: { kind: "session", sessionId: "terminal-a" },
      second: {
        kind: "split",
        id: "split-b-c",
        direction: "vertical",
        first: { kind: "session", sessionId: "terminal-b" },
        second: { kind: "session", sessionId: "terminal-c" },
      },
    });
    expect(getTerminalGroupSessionIds(group)).toEqual([
      "terminal-a",
      "terminal-b",
      "terminal-c",
    ]);
    expect(getActiveTerminalSessionId(state)).toBe("terminal-c");
    assertDesktopTerminalSessionsState(state);
  });

  it("preserves a direct sibling split identity and treats its current slot as a no-op", () => {
    let state = createTwoSessions();
    state = move(state, "terminal-b", "terminal-a", "horizontal", "second", "split-a-b");
    const grouped = state;

    state = move(state, "terminal-b", "terminal-a", "horizontal", "second", "unused-split");
    expect(state).toBe(grouped);

    state = move(state, "terminal-b", "terminal-a", "horizontal", "first", "unused-split-2");
    expect(getActiveTerminalGroup(state)?.root).toMatchObject({
      id: "split-a-b",
      direction: "horizontal",
      ratio: 0.5,
      first: { sessionId: "terminal-b" },
      second: { sessionId: "terminal-a" },
    });
    assertDesktopTerminalSessionsState(state);
  });

  it("activates one Session while preserving every visible sibling in its Group", () => {
    let state = createTwoSessions();
    state = move(state, "terminal-b", "terminal-a", "horizontal", "second", "split-a-b");
    state = desktopTerminalSessionsReducer(state, { type: "activate", sessionId: "terminal-a" });

    expect(getActiveTerminalSessionId(state)).toBe("terminal-a");
    expect(getTerminalGroupSessionIds(getActiveTerminalGroup(state)!)).toEqual([
      "terminal-a",
      "terminal-b",
    ]);
  });

  it("unsplits a Session into a new standalone Group without replacing it", () => {
    let state = createTwoSessions();
    state = move(state, "terminal-b", "terminal-a", "horizontal", "second", "split-a-b");
    const sessionBefore = state.sessions.find(({ id }) => id === "terminal-b");

    state = desktopTerminalSessionsReducer(state, {
      type: "unsplit",
      sessionId: "terminal-b",
      groupId: "group-unsplit-b",
    });

    expect(state.groups).toHaveLength(2);
    expect(getActiveTerminalGroup(state)).toMatchObject({
      id: "group-unsplit-b",
      focusedSessionId: "terminal-b",
      root: { kind: "session", sessionId: "terminal-b" },
    });
    expect(state.sessions.find(({ id }) => id === "terminal-b")).toBe(sessionBefore);
    assertDesktopTerminalSessionsState(state);
  });

  it("collapses redundant ancestors and chooses deterministic focus when closing", () => {
    let state = createThreeSessions();
    state = move(state, "terminal-b", "terminal-a", "horizontal", "second", "split-a-b");
    state = move(state, "terminal-c", "terminal-b", "vertical", "second", "split-b-c");

    state = desktopTerminalSessionsReducer(state, { type: "close", sessionId: "terminal-b" });
    expect(getTerminalGroupSessionIds(getActiveTerminalGroup(state)!)).toEqual([
      "terminal-a",
      "terminal-c",
    ]);
    expect(getActiveTerminalSessionId(state)).toBe("terminal-c");
    expect(getActiveTerminalGroup(state)?.root).toMatchObject({
      id: "split-a-b",
      second: { kind: "session", sessionId: "terminal-c" },
    });

    state = desktopTerminalSessionsReducer(state, { type: "close", sessionId: "terminal-c" });
    expect(getActiveTerminalSessionId(state)).toBe("terminal-a");
    expect(getActiveTerminalGroup(state)?.root).toMatchObject({
      kind: "session",
      sessionId: "terminal-a",
    });
    assertDesktopTerminalSessionsState(state);
  });

  it("updates one split ratio without affecting lifecycle state", () => {
    let state = createTwoSessions();
    state = move(state, "terminal-b", "terminal-a", "horizontal", "second", "split-a-b");
    const sessions = state.sessions;

    state = desktopTerminalSessionsReducer(state, {
      type: "resize-split",
      splitId: "split-a-b",
      ratio: 0.625,
    });

    expect(getActiveTerminalGroup(state)?.root).toMatchObject({ ratio: 0.625 });
    expect(state.sessions).toEqual(sessions);
    expect(state.sessions[0]).toBe(sessions[0]);
  });

  it("preserves ownership invariants across deterministic mixed commands", () => {
    let state = createDesktopTerminalSessionsState();
    for (let index = 0; index < 6; index += 1) {
      state = create(state, `terminal-${index}`, `group-${index}`);
    }
    let seed = 0x5f3759df;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000;
    };

    for (let index = 0; index < 80; index += 1) {
      const ids = state.sessions.map(({ id }) => id);
      const source = ids[Math.floor(random() * ids.length)]!;
      let target = ids[Math.floor(random() * ids.length)]!;
      if (target === source) target = ids[(ids.indexOf(source) + 1) % ids.length]!;
      if (index % 9 === 0) {
        state = desktopTerminalSessionsReducer(state, {
          type: "unsplit",
          sessionId: source,
          groupId: `random-group-${index}`,
        });
      } else if (index % 7 === 0) {
        state = desktopTerminalSessionsReducer(state, { type: "activate", sessionId: source });
      } else {
        state = move(
          state,
          source,
          target,
          random() > 0.5 ? "horizontal" : "vertical",
          random() > 0.5 ? "first" : "second",
          `random-split-${index}`,
        );
      }
      assertDesktopTerminalSessionsState(state);
    }
  });

  it("returns a failed startup to the selector inside the same leaf", () => {
    let state = createDesktopTerminalSessionsState();
    state = desktopTerminalSessionsReducer(state, {
      type: "create-launcher",
      sessionId: "terminal-agent",
      groupId: "group-agent",
    });
    const groupBefore = state.groups[0];
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
    expect(state.groups[0]).toBe(groupBefore);
  });
});

function createTwoSessions() {
  let state = createDesktopTerminalSessionsState();
  state = create(state, "terminal-a", "group-a");
  return create(state, "terminal-b", "group-b");
}

function createThreeSessions() {
  return create(createTwoSessions(), "terminal-c", "group-c");
}

function create(
  state: DesktopTerminalSessionsState,
  sessionId: string,
  groupId: string,
) {
  return desktopTerminalSessionsReducer(state, {
    type: "create",
    sessionId,
    groupId,
    launcherId: "shell",
  });
}

function move(
  state: DesktopTerminalSessionsState,
  sourceSessionId: string,
  targetSessionId: string,
  direction: "horizontal" | "vertical",
  placement: "first" | "second",
  splitId: string,
) {
  return desktopTerminalSessionsReducer(state, {
    type: "move",
    sourceSessionId,
    targetSessionId,
    direction,
    placement,
    splitId,
  });
}
