import { useCallback, useMemo, useReducer, useRef } from "react";
import { createPortal } from "react-dom";
import {
  findWorkbenchSplitLeaf,
  workbenchSplitDefinition,
  type WorkbenchSplitDropEdge,
} from "@puppyone/shared-ui";
import {
  canPlaceTerminalSplit,
  terminalLeafMinimumSize,
} from "../model/terminalSplitConstraints";
import {
  canUnsplitTerminalSession,
  createDesktopTerminalSessionsState,
  desktopTerminalSessionsReducer,
  getActiveTerminalGroup,
  getActiveTerminalSessionId,
  getOrderedTerminalSessions,
  getTerminalGroupSessionIds,
} from "../model/terminalSessions";
import { useTerminalTabMoveDrag } from "../interactions/useTerminalTabMoveDrag";
import { TerminalGroupViewport } from "../layout/TerminalGroupViewport";
import { usePersistentTerminalSessionHosts } from "../layout/session-host/usePersistentTerminalSessionHosts";
import { TerminalSessionHeader } from "./session-header/TerminalSessionHeader";
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
    () => activeGroup ? getTerminalGroupSessionIds(activeGroup) : [],
    [activeGroup],
  );
  const hosts = usePersistentTerminalSessionHosts(sessions.map(({ id }) => id));
  const runtimeRegistry = useMemo(() => ({ get: () => null }), []);
  const nextId = useCallback((kind: "group" | "session" | "split") => (
    `smoke-${kind}-${nextIdRef.current++}`
  ), []);

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
      splitId: nextId("split"),
    });
  }, [nextId]);
  const canDrop = useCallback((
    sourceSessionId: string,
    targetSessionId: string,
    edge: WorkbenchSplitDropEdge,
    targetPane: HTMLElement,
  ) => {
    if (sourceSessionId === targetSessionId) return false;
    const sourceExists = state.groups.some((group) => (
      findWorkbenchSplitLeaf(group.root, sourceSessionId)
    ));
    return sourceExists && canPlaceTerminalSplit(
      targetPane.getBoundingClientRect(),
      edge,
      terminalLeafMinimumSize(null),
      terminalLeafMinimumSize(null),
    );
  }, [state.groups]);
  const tabMove = useTerminalTabMoveDrag({ canDrop, onMoveSession: moveSession });

  const moveToActive = useCallback((sessionId: string, edge: WorkbenchSplitDropEdge) => {
    if (activeSessionId) moveSession(sessionId, activeSessionId, edge);
  }, [activeSessionId, moveSession]);
  const moveByKeyboard = useCallback((sessionId: string, edge: WorkbenchSplitDropEdge) => {
    const sourceIndex = presentedSessionIds.indexOf(sessionId);
    const offset = edge === "left" || edge === "top" ? -1 : 1;
    const targetSessionId = presentedSessionIds[sourceIndex + offset];
    if (targetSessionId) moveSession(sessionId, targetSessionId, edge);
  }, [moveSession, presentedSessionIds]);

  return (
    <main className="desktop-terminal-split-smoke">
      <section className="desktop-terminal-split-smoke-panel desktop-terminal-panel">
        <TerminalSessionHeader
          activeSessionId={activeSessionId}
          canMoveSessionToActive={(sessionId) => sessionId !== activeSessionId}
          onActivate={(sessionId) => dispatch({ type: "activate", sessionId })}
          onClose={(sessionId) => dispatch({ type: "close", sessionId })}
          onCreate={() => dispatch({
            type: "create-launcher",
            sessionId: nextId("session"),
            groupId: nextId("group"),
          })}
          onMoveByKeyboard={moveByKeyboard}
          onMoveSessionToActive={moveToActive}
          onUnsplitActive={activeSessionId && canUnsplitTerminalSession(state, activeSessionId)
            ? () => dispatch({
                type: "unsplit",
                sessionId: activeSessionId,
                groupId: nextId("group"),
              })
            : undefined}
          presentedSessionIds={presentedSessionIds}
          sessions={sessions}
          tabMove={tabMove}
          workspacePath="/workspace/terminal-split-smoke"
        />
        <div className="desktop-terminal-body">
          {activeGroup && (
            <TerminalGroupViewport
              dropIntent={tabMove.dropIntent}
              group={activeGroup}
              hosts={hosts}
              runtimeRegistry={runtimeRegistry}
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
          groups: state.groups.map((group) => ({
            id: group.id,
            focusedSessionId: group.focusedSessionId,
            sessions: getTerminalGroupSessionIds(group),
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
