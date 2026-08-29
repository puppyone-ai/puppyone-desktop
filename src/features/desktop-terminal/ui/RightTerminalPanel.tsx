import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import type { Workspace } from "@puppyone/shared-ui";
import {
  findDirectSiblingWorkbenchSplit,
  findWorkbenchSplitLeaf,
  workbenchSplitDefinition,
  type WorkbenchSplitDropEdge,
} from "@puppyone/shared-ui";
import { useLocalization } from "@puppyone/localization/react";
import { useTerminalAgentLocator } from "../controller/useTerminalAgentLocator";
import { useTerminalSessions } from "../controller/useTerminalSessions";
import {
  canPlaceTerminalSplit,
  terminalLeafMinimumSize,
} from "../model/terminalSplitConstraints";
import type { DesktopTerminalLauncherId } from "../model/terminalLaunchers";
import { useTerminalTabMoveDrag } from "../interactions/useTerminalTabMoveDrag";
import { TerminalGroupViewport } from "../layout/TerminalGroupViewport";
import { usePersistentTerminalSessionHosts } from "../layout/session-host/usePersistentTerminalSessionHosts";
import { useTerminalAppearanceSync } from "../runtime/useTerminalAppearanceSync";
import { TerminalCloseConfirmationDialog } from "./TerminalCloseConfirmationDialog";
import { TerminalLauncher } from "./TerminalLauncher";
import { TerminalSessionHost } from "./TerminalSessionHost";
import { TerminalSessionHeader } from "./session-header/TerminalSessionHeader";
import "@xterm/xterm/css/xterm.css";
import "./desktop-terminal.css";

type RightTerminalPanelProps = {
  workspace: Workspace;
  active: boolean;
  hiddenAgentIds: readonly string[];
};

export function RightTerminalPanel({ workspace, active, hiddenAgentIds }: RightTerminalPanelProps) {
  const { t } = useLocalization();
  const panelRef = useRef<HTMLElement>(null);
  const {
    activeGroup,
    activeSessionId,
    activateSession,
    cancelCloseSession,
    confirmCloseSession,
    createLauncher,
    createSession,
    groups,
    launchSession,
    moveSession,
    pendingCloseSession,
    presentedSessionIds,
    requestCloseSession,
    resizeSplit,
    runtimeRegistry,
    sessionCanUnsplit,
    sessions,
    unsplitSession,
  } = useTerminalSessions({
    messageFormatter: t,
    workspacePath: workspace.path,
  });
  const sessionIds = useMemo(() => sessions.map(({ id }) => id), [sessions]);
  const sessionHosts = usePersistentTerminalSessionHosts(sessionIds);
  const presentedSessionIdSet = useMemo(
    () => new Set(presentedSessionIds),
    [presentedSessionIds],
  );
  const presentedSessions = useMemo(() => sessions.filter(
    (session) => presentedSessionIdSet.has(session.id),
  ), [presentedSessionIdSet, sessions]);
  const launcherVisible = active && (
    sessions.length === 0
    || presentedSessions.some((session) => (
      session.status === "selecting" || session.status === "starting"
    ))
  );
  const {
    ids: availableAgentIds,
    phase: agentDiscoveryPhase,
    refresh: refreshAvailableAgents,
  } = useTerminalAgentLocator({ enabled: launcherVisible });
  const visibleAgentIds = useMemo(() => {
    const hidden = new Set(hiddenAgentIds);
    return availableAgentIds.filter((agentId) => !hidden.has(agentId));
  }, [availableAgentIds, hiddenAgentIds]);
  const canLaunch = useCallback((launcherId: DesktopTerminalLauncherId) => (
    launcherId === "shell" || visibleAgentIds.includes(launcherId)
  ), [visibleAgentIds]);
  const createDetectedSession = useCallback((launcherId: DesktopTerminalLauncherId) => {
    if (canLaunch(launcherId)) createSession(launcherId);
  }, [canLaunch, createSession]);
  const launchDetectedSession = useCallback((
    sessionId: string,
    launcherId: DesktopTerminalLauncherId,
  ) => {
    if (canLaunch(launcherId)) launchSession(sessionId, launcherId);
  }, [canLaunch, launchSession]);

  useEffect(() => {
    if (!presentedSessions.some((session) => session.launchError)) return;
    void refreshAvailableAgents();
  }, [presentedSessions, refreshAvailableAgents]);

  const canDropSession = useCallback((
    sourceSessionId: string,
    targetSessionId: string,
    edge: WorkbenchSplitDropEdge,
    targetPane: HTMLElement,
  ) => {
    const sourceGroup = groups.find((group) => (
      findWorkbenchSplitLeaf(group.root, sourceSessionId)
    ));
    const targetGroup = groups.find((group) => (
      findWorkbenchSplitLeaf(group.root, targetSessionId)
    ));
    if (!sourceGroup || !targetGroup || sourceSessionId === targetSessionId) return false;
    const sourceMinimum = terminalLeafMinimumSize(
      runtimeRegistry.get(sourceSessionId)?.getMinimumViewportSize(),
    );
    const targetMinimum = terminalLeafMinimumSize(
      runtimeRegistry.get(targetSessionId)?.getMinimumViewportSize(),
    );
    const sibling = sourceGroup.id === targetGroup.id
      ? findDirectSiblingWorkbenchSplit(
          sourceGroup.root,
          sourceSessionId,
          targetSessionId,
        )
      : null;
    const { direction } = workbenchSplitDefinition(edge);
    if (sibling && sibling.direction === direction) return true;
    const admissionElement = sibling
      ? targetPane.parentElement ?? targetPane
      : targetPane;
    return canPlaceTerminalSplit(
      admissionElement.getBoundingClientRect(),
      edge,
      sourceMinimum,
      targetMinimum,
    );
  }, [groups, runtimeRegistry]);

  const canMoveSessionToActive = useCallback((
    sourceSessionId: string,
    edge: WorkbenchSplitDropEdge,
  ) => {
    if (!activeSessionId || sourceSessionId === activeSessionId) return false;
    const targetPane = panelRef.current?.querySelector<HTMLElement>(
      `[data-terminal-session-pane-id="${activeSessionId}"]`,
    );
    return Boolean(
      targetPane
      && canDropSession(sourceSessionId, activeSessionId, edge, targetPane),
    );
  }, [activeSessionId, canDropSession]);
  const moveSessionToActive = useCallback((
    sourceSessionId: string,
    edge: WorkbenchSplitDropEdge,
  ) => {
    if (activeSessionId && canMoveSessionToActive(sourceSessionId, edge)) {
      moveSession(sourceSessionId, activeSessionId, edge);
    }
  }, [activeSessionId, canMoveSessionToActive, moveSession]);
  const tabMove = useTerminalTabMoveDrag({
    canDrop: canDropSession,
    onMoveSession: moveSession,
  });
  const moveSessionByKeyboard = useCallback((
    sourceSessionId: string,
    edge: WorkbenchSplitDropEdge,
  ) => {
    const sourceIndex = presentedSessions.findIndex(
      (session) => session.id === sourceSessionId,
    );
    const offset = edge === "left" || edge === "top" ? -1 : 1;
    const target = presentedSessions[sourceIndex + offset];
    if (sourceIndex < 0 || !target) return;
    const targetPane = panelRef.current?.querySelector<HTMLElement>(
      `[data-terminal-session-pane-id="${target.id}"]`,
    );
    if (!targetPane || !canDropSession(sourceSessionId, target.id, edge, targetPane)) return;
    moveSession(sourceSessionId, target.id, edge);
  }, [canDropSession, moveSession, presentedSessions]);

  useTerminalAppearanceSync(panelRef, runtimeRegistry);
  return (
    <section
      ref={panelRef}
      className="desktop-terminal-panel"
      aria-label={t("terminal.title")}
    >
      {sessions.length > 0 && (
        <TerminalSessionHeader
          sessions={sessions}
          activeSessionId={activeSessionId}
          canMoveSessionToActive={canMoveSessionToActive}
          onActivate={activateSession}
          onClose={requestCloseSession}
          onCreate={createLauncher}
          onMoveByKeyboard={moveSessionByKeyboard}
          onMoveSessionToActive={moveSessionToActive}
          onUnsplitActive={activeSessionId && sessionCanUnsplit(activeSessionId)
            ? () => unsplitSession(activeSessionId)
            : undefined}
          presentedSessionIds={presentedSessionIds}
          runtimeRegistry={runtimeRegistry}
          tabMove={tabMove}
          workspacePath={workspace.path}
        />
      )}
      <div className={`desktop-terminal-body ${sessions.length === 0 ? "is-empty" : ""}`}>
        {sessions.length === 0 ? (
          <TerminalLauncher
            discoveryPhase={agentDiscoveryPhase}
            availableAgentIds={visibleAgentIds}
            onLaunch={createDetectedSession}
            onRefresh={() => void refreshAvailableAgents()}
          />
        ) : activeGroup ? (
          <TerminalGroupViewport
            dropIntent={tabMove.dropIntent}
            group={activeGroup}
            hosts={sessionHosts}
            runtimeRegistry={runtimeRegistry}
            onResizeSplit={resizeSplit}
          />
        ) : null}
        {sessions.map((session) => createPortal(
          <TerminalSessionHost
            discoveryPhase={agentDiscoveryPhase}
            availableAgentIds={visibleAgentIds}
            focused={active && activeSessionId === session.id}
            onFocus={() => activateSession(session.id)}
            onLaunch={(launcherId) => launchDetectedSession(session.id, launcherId)}
            onRefresh={() => void refreshAvailableAgents()}
            presented={active && presentedSessionIdSet.has(session.id)}
            runtime={runtimeRegistry.get(session.id)}
            session={session}
            workspacePath={workspace.path}
          />,
          sessionHosts.get(session.id)!,
          session.id,
        ))}
      </div>
      {pendingCloseSession && (
        <TerminalCloseConfirmationDialog
          title={t("terminal.sessionTitle", { number: pendingCloseSession.ordinal })}
          onCancel={cancelCloseSession}
          onConfirm={confirmCloseSession}
        />
      )}
    </section>
  );
}
