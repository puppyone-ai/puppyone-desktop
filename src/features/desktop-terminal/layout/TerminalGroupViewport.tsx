import {
  useCallback,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { isWorkbenchSplit, type WorkbenchSplitDropEdge } from "@puppyone/shared-ui";
import type { TerminalTabMoveDragController } from "../interactions/useTerminalTabMoveDrag";
import type { TerminalTabMoveDropIntent } from "../model/terminalTabMove";
import {
  terminalLeafMinimumSize,
  terminalSplitChildMinimumSizes,
  type TerminalSplitMinimumSize,
} from "../model/terminalSplitConstraints";
import type {
  DesktopTerminalGroup,
  DesktopTerminalLayoutNode,
  DesktopTerminalLayoutSplit,
  DesktopTerminalSession,
} from "../model/terminalSessions";
import type { TerminalRuntimeRegistry } from "../runtime/terminalRuntimeRegistry";
import { TerminalSessionHeader } from "../ui/session-header/TerminalSessionHeader";
import {
  terminalPanelId,
  terminalTabId,
} from "../ui/session-header/terminalSessionHeaderIds";
import { TerminalGroupMoveHandle } from "./TerminalGroupMoveHandle";
import { TerminalSplitResizeHandle } from "./TerminalSplitResizeHandle";
import { TerminalSessionHostSlot } from "./session-host/TerminalSessionHostSlot";
import type {
  PersistentTerminalSessionHosts,
} from "./session-host/usePersistentTerminalSessionHosts";
import { useTerminalGroupHandleReveal } from "./useTerminalGroupHandleReveal";

export type TerminalGroupViewportProps = Readonly<{
  activeGroupId: string | null;
  dropIntent: TerminalTabMoveDropIntent | null;
  groups: readonly DesktopTerminalGroup[];
  hosts: PersistentTerminalSessionHosts;
  root: DesktopTerminalLayoutNode;
  runtimeRegistry: Pick<TerminalRuntimeRegistry, "get" | "require">;
  sessions: readonly DesktopTerminalSession[];
  sessionMove: TerminalTabMoveDragController;
  workspacePath: string;
  onActivateSession: (sessionId: string) => void;
  onCloseSession: (sessionId: string) => void;
  onCreateSession: (groupId: string) => void;
  onMoveByKeyboard: (
    sessionId: string,
    targetGroupId: string,
    edge: WorkbenchSplitDropEdge,
  ) => void;
  onResizeSplit: (splitId: string, ratio: number) => void;
}>;

/** Projects the Sidebar split tree; every leaf owns a complete local Tab Group. */
export function TerminalGroupViewport({
  activeGroupId,
  dropIntent,
  groups,
  hosts,
  root,
  runtimeRegistry,
  sessions,
  sessionMove,
  workspacePath,
  onActivateSession,
  onCloseSession,
  onCreateSession,
  onMoveByKeyboard,
  onResizeSplit,
}: TerminalGroupViewportProps) {
  const groupById = useMemo(
    () => new Map(groups.map((group) => [group.id, group])),
    [groups],
  );
  const sessionById = useMemo(
    () => new Map(sessions.map((session) => [session.id, session])),
    [sessions],
  );
  const getLeafMinimum = useCallback((groupId: string) => {
    const group = groupById.get(groupId);
    return terminalLeafMinimumSize(
      group ? runtimeRegistry.get(group.activeSessionId)?.getMinimumViewportSize() : null,
    );
  }, [groupById, runtimeRegistry]);

  return (
    <div className="desktop-terminal-group-viewport">
      <TerminalLayoutNode
        activeGroupId={activeGroupId}
        dropIntent={dropIntent}
        getLeafMinimum={getLeafMinimum}
        groupById={groupById}
        hosts={hosts}
        node={root}
        runtimeRegistry={runtimeRegistry}
        sessionById={sessionById}
        sessionMove={sessionMove}
        workspacePath={workspacePath}
        onActivateSession={onActivateSession}
        onCloseSession={onCloseSession}
        onCreateSession={onCreateSession}
        onMoveByKeyboard={onMoveByKeyboard}
        onResizeSplit={onResizeSplit}
      />
    </div>
  );
}

type TerminalLayoutNodeProps = Readonly<{
  activeGroupId: string | null;
  dropIntent: TerminalTabMoveDropIntent | null;
  getLeafMinimum: (groupId: string) => TerminalSplitMinimumSize;
  groupById: ReadonlyMap<string, DesktopTerminalGroup>;
  hosts: PersistentTerminalSessionHosts;
  node: DesktopTerminalLayoutNode;
  runtimeRegistry: TerminalGroupViewportProps["runtimeRegistry"];
  sessionById: ReadonlyMap<string, DesktopTerminalSession>;
  sessionMove: TerminalTabMoveDragController;
  workspacePath: string;
  onActivateSession: TerminalGroupViewportProps["onActivateSession"];
  onCloseSession: TerminalGroupViewportProps["onCloseSession"];
  onCreateSession: TerminalGroupViewportProps["onCreateSession"];
  onMoveByKeyboard: TerminalGroupViewportProps["onMoveByKeyboard"];
  onResizeSplit: TerminalGroupViewportProps["onResizeSplit"];
}>;

function TerminalLayoutNode(props: TerminalLayoutNodeProps): ReactNode {
  if (!isWorkbenchSplit(props.node)) {
    const group = props.groupById.get(props.node.groupId);
    if (!group) return null;
    return <TerminalTabGroupLeaf {...props} group={group} />;
  }
  return <TerminalSplit {...props} split={props.node} />;
}

function TerminalTabGroupLeaf({
  activeGroupId,
  dropIntent,
  group,
  hosts,
  runtimeRegistry,
  sessionById,
  sessionMove,
  workspacePath,
  onActivateSession,
  onCloseSession,
  onCreateSession,
  onMoveByKeyboard,
}: TerminalLayoutNodeProps & { group: DesktopTerminalGroup }) {
  const groupRef = useRef<HTMLElement>(null);
  const sessions = group.sessionIds
    .map((sessionId) => sessionById.get(sessionId))
    .filter((session): session is DesktopTerminalSession => Boolean(session));
  const intent = dropIntent?.targetGroupId === group.id ? dropIntent : null;
  const edgeIntent = intent?.kind === "split" || intent?.kind === "move-group"
    ? intent
    : null;
  const insertIntent = intent?.kind === "insert" || intent?.kind === "merge-group"
    ? intent
    : null;
  const activeSession = sessionById.get(group.activeSessionId);
  const host = hosts.get(group.activeSessionId);
  const handleReveal = useTerminalGroupHandleReveal(groupRef, Boolean(intent));

  return (
    <section
      ref={groupRef}
      className="desktop-terminal-tab-group"
      data-terminal-group-pane-id={group.id}
      data-focused={activeGroupId === group.id ? "true" : undefined}
      data-handle-hot={handleReveal.revealed ? "true" : undefined}
      data-drop-target={edgeIntent?.edge}
      onPointerMove={handleReveal.onPointerMove}
      onPointerLeave={handleReveal.onPointerLeave}
    >
      <TerminalSessionHeader
        activeSessionId={group.activeSessionId}
        dropInsertion={insertIntent}
        groupId={group.id}
        onActivate={onActivateSession}
        onClose={onCloseSession}
        onCreate={() => onCreateSession(group.id)}
        onMoveByKeyboard={(sessionId, edge) => onMoveByKeyboard(sessionId, group.id, edge)}
        presentedSessionIds={[group.activeSessionId]}
        runtimeRegistry={runtimeRegistry}
        sessions={sessions}
        tabMove={sessionMove}
        workspacePath={workspacePath}
      />
      {activeSession && (
        <TerminalGroupMoveHandle
          groupId={group.id}
          session={activeSession}
          sessionIds={group.sessionIds}
          sessionMove={sessionMove}
          onActivate={onActivateSession}
        />
      )}
      <div
        className="desktop-terminal-tab-group-content"
        data-terminal-content-drop-group-id={group.id}
      >
        {activeSession && host && (
          <TerminalSessionHostSlot
            focused={activeGroupId === group.id}
            host={host}
            labelledBy={terminalTabId(activeSession.id)}
            panelId={terminalPanelId(activeSession.id)}
            sessionId={activeSession.id}
          />
        )}
      </div>
      {edgeIntent && (
        <div
          className="desktop-terminal-drop-preview"
          data-edge={edgeIntent.edge}
          data-allowed={edgeIntent.allowed ? "true" : "false"}
          data-operation={edgeIntent.kind}
          aria-hidden="true"
        />
      )}
      <div className="desktop-terminal-pane-interaction-frame" aria-hidden="true" />
    </section>
  );
}

function TerminalSplit({
  node: _node,
  split,
  ...props
}: TerminalLayoutNodeProps & { split: DesktopTerminalLayoutSplit }) {
  const minimums = terminalSplitChildMinimumSizes(split, props.getLeafMinimum);
  const style = {
    "--desktop-terminal-first-track": `${split.ratio}fr`,
    "--desktop-terminal-second-track": `${1 - split.ratio}fr`,
  } as CSSProperties;

  return (
    <div
      className="desktop-terminal-split"
      data-direction={split.direction}
      data-terminal-split-id={split.id}
      style={style}
    >
      <TerminalLayoutNode key={split.first.id} {...props} node={split.first} />
      <TerminalSplitResizeHandle
        key={split.id}
        direction={split.direction}
        firstMinimum={minimums.first}
        secondMinimum={minimums.second}
        ratio={split.ratio}
        splitId={split.id}
        onCommit={props.onResizeSplit}
      />
      <TerminalLayoutNode key={split.second.id} {...props} node={split.second} />
    </div>
  );
}
