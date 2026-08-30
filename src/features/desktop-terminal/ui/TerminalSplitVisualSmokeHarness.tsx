import { useCallback, useMemo, useReducer, useRef } from "react";
import { createPortal } from "react-dom";
import type { WorkbenchSplitDropEdge } from "@puppyone/shared-ui";
import { useTerminalTabMoveDrag } from "../interactions/useTerminalTabMoveDrag";
import { TerminalGroupViewport } from "../layout/TerminalGroupViewport";
import { usePersistentTerminalSessionHosts } from "../layout/session-host/usePersistentTerminalSessionHosts";
import {
  canPlaceTerminalSplit,
  terminalLeafMinimumSize,
} from "../model/terminalSplitConstraints";
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
import "./desktop-terminal.css";

/** Real-Chromium geometry harness. It deliberately owns no xterm or PTY. */
export function TerminalSplitVisualSmokeHarness() {
  const [state, dispatch] = useReducer(
    desktopTerminalSessionsReducer,
    null,
    createSmokeState,
  );
  const nextIdRef = useRef(1);
  const sessions = useMemo(() => getOrderedTerminalSessions(state), [state]);
  const activeGroup = getActiveTerminalGroup(state);
  const activeSessionId = getActiveTerminalSessionId(state);
  const presentedSessionIds = useMemo(
    () => getPresentedTerminalSessionIds(state),
    [state],
  );
  const hosts = usePersistentTerminalSessionHosts(sessions.map(({ id }) => id));
  const runtimeRegistry = useMemo(() => ({
    get: () => null,
    require: () => null as never,
  }), []);
  const nextId = useCallback((kind: "group" | "session" | "split") => (
    `smoke-${kind}-${nextIdRef.current++}`
  ), []);

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
      groupId: nextId("group"),
      splitId: nextId("split"),
    });
  }, [nextId]);
  const canDrop = useCallback((
    sourceSessionId: string,
    targetGroupId: string,
    edge: WorkbenchSplitDropEdge,
    targetPane: HTMLElement,
  ) => {
    const sourceGroup = state.groups.find((group) => (
      group.sessionIds.includes(sourceSessionId)
    ));
    if (!canSplitTerminalSession(state, sourceSessionId, targetGroupId)) return false;
    if (sourceGroup?.id !== targetGroupId && sourceGroup?.sessionIds.length === 1) return true;
    return canPlaceTerminalSplit(
      targetPane.getBoundingClientRect(),
      edge,
      terminalLeafMinimumSize(null),
      terminalLeafMinimumSize(null),
    );
  }, [state]);
  const tabMove = useTerminalTabMoveDrag({
    canDrop,
    canInsert: (sourceSessionId, targetGroupId, targetIndex) => (
      canInsertTerminalSession(state, sourceSessionId, targetGroupId, targetIndex)
    ),
    canMergeGroup: (sourceGroupId, targetGroupId, targetIndex) => (
      canMergeTerminalGroup(state, sourceGroupId, targetGroupId, targetIndex)
    ),
    onInsertSession: (sourceSessionId, targetGroupId, targetIndex) => dispatch({
      type: "merge-tab",
      sourceSessionId,
      targetGroupId,
      targetIndex,
    }),
    onMergeGroup: (sourceGroupId, targetGroupId, targetIndex) => dispatch({
      type: "merge-group",
      sourceGroupId,
      targetGroupId,
      targetIndex,
    }),
    canMoveGroup: (sourceGroupId, targetGroupId) => (
      canMoveTerminalGroup(state, sourceGroupId, targetGroupId)
    ),
    onMoveGroup: (sourceGroupId, targetGroupId, edge) => dispatch({
      type: "move-group",
      sourceGroupId,
      targetGroupId,
      edge,
      splitId: nextId("split"),
    }),
    onMoveSession: splitSession,
  });

  return (
    <main className="desktop-terminal-split-smoke">
      <section className="desktop-terminal-split-smoke-panel desktop-terminal-panel">
        <div className="desktop-terminal-body">
          {state.root && (
            <TerminalGroupViewport
              activeGroupId={activeGroup?.id ?? null}
              dropIntent={tabMove.dropIntent}
              groups={state.groups}
              hosts={hosts}
              root={state.root}
              runtimeRegistry={runtimeRegistry}
              sessions={sessions}
              sessionMove={tabMove}
              workspacePath="/workspace/terminal-split-smoke"
              onActivateSession={(sessionId) => dispatch({ type: "activate", sessionId })}
              onCloseSession={(sessionId) => dispatch({ type: "close", sessionId })}
              onCreateSession={(targetGroupId) => dispatch({
                type: "create",
                sessionId: nextId("session"),
                groupId: nextId("group"),
                targetGroupId,
                launcherId: "shell",
              })}
              onMoveByKeyboard={splitSession}
              onResizeSplit={(splitId, ratio) => dispatch({
                type: "resize-split",
                splitId,
                ratio,
              })}
            />
          )}
          {sessions.map((session) => createPortal(
            <div className="desktop-terminal-split-smoke-session">
              <strong>{`Terminal ${session.ordinal}`}</strong>
              <span>{session.id}</span>
            </div>,
            hosts.get(session.id)!,
            session.id,
          ))}
        </div>
      </section>
      <output className="desktop-terminal-split-smoke-output" aria-live="polite">
        {JSON.stringify({
          activeGroupId: state.activeGroupId,
          activeSessionId,
          presentedSessionIds,
          groups: state.groups.map((group) => ({
            id: group.id,
            activeSessionId: group.activeSessionId,
            sessions: group.sessionIds,
          })),
        })}
      </output>
    </main>
  );
}

function createSmokeState() {
  let state = createDesktopTerminalSessionsState();
  for (let index = 1; index <= 3; index += 1) {
    state = desktopTerminalSessionsReducer(state, {
      type: "create",
      sessionId: `smoke-session-${index}`,
      groupId: `smoke-group-${index}`,
      launcherId: "shell",
    });
    state = desktopTerminalSessionsReducer(state, {
      type: "runtime-status",
      sessionId: `smoke-session-${index}`,
      status: "running",
      shell: "zsh",
    });
  }
  return state;
}
