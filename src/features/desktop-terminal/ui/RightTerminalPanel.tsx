import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import type { Workspace } from "@puppyone/shared-ui";
import type { WorkbenchSplitDropEdge } from "@puppyone/shared-ui";
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
    groupCanMerge,
    groupCanMove,
    groups,
    launchSession,
    mergeSession,
    mergeGroup,
    moveGroup,
    pendingCloseSession,
    presentedSessionIds,
    requestCloseSession,
    root,
    resizeSplit,
    runtimeRegistry,
    sessionCanInsert,
    sessionCanSplit,
    sessions,
    splitSession,
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
    targetGroupId: string,
    edge: WorkbenchSplitDropEdge,
    targetGroupPane: HTMLElement,
  ) => {
    const sourceGroup = groups.find((group) => group.sessionIds.includes(sourceSessionId));
    const targetGroup = groups.find((group) => group.id === targetGroupId);
    if (!sourceGroup || !targetGroup || !sessionCanSplit(sourceSessionId, targetGroupId)) {
      return false;
    }
    // Moving the only Tab out of a Group repositions an existing leaf; it does
    // not create another split and therefore must not be blocked by min-size.
    if (sourceGroup.id !== targetGroup.id && sourceGroup.sessionIds.length === 1) {
      return true;
    }
    const sourceMinimum = terminalLeafMinimumSize(
      runtimeRegistry.get(sourceSessionId)?.getMinimumViewportSize(),
    );
    const targetMinimum = terminalLeafMinimumSize(
      runtimeRegistry.get(targetGroup.activeSessionId)?.getMinimumViewportSize(),
    );
    return canPlaceTerminalSplit(
      targetGroupPane.getBoundingClientRect(),
      edge,
      sourceMinimum,
      targetMinimum,
    );
  }, [groups, runtimeRegistry, sessionCanSplit]);

  const canMoveGroup = useCallback((
    sourceGroupId: string,
    targetGroupId: string,
  ) => groupCanMove(sourceGroupId, targetGroupId), [groupCanMove]);

  const tabMove = useTerminalTabMoveDrag({
    canDrop: canDropSession,
    canInsert: sessionCanInsert,
    canMergeGroup: groupCanMerge,
    canMoveGroup,
    onInsertSession: mergeSession,
    onMergeGroup: mergeGroup,
    onMoveGroup: moveGroup,
    onMoveSession: splitSession,
  });
  const moveSessionByKeyboard = useCallback((
    sourceSessionId: string,
    targetGroupId: string,
    edge: WorkbenchSplitDropEdge,
  ) => {
    const targetPane = panelRef.current?.querySelector<HTMLElement>(
      `[data-terminal-content-drop-group-id="${targetGroupId}"]`,
    );
    if (targetPane && canDropSession(sourceSessionId, targetGroupId, edge, targetPane)) {
      splitSession(sourceSessionId, targetGroupId, edge);
    }
  }, [canDropSession, splitSession]);

  useTerminalAppearanceSync(panelRef, runtimeRegistry);
  return (
    <section
      ref={panelRef}
      className="desktop-terminal-panel"
      aria-label={t("terminal.title")}
    >
      <div className={`desktop-terminal-body ${sessions.length === 0 ? "is-empty" : ""}`}>
        {sessions.length === 0 ? (
          <TerminalLauncher
            discoveryPhase={agentDiscoveryPhase}
            availableAgentIds={visibleAgentIds}
            onLaunch={createDetectedSession}
            onRefresh={() => void refreshAvailableAgents()}
          />
        ) : root ? (
          <TerminalGroupViewport
            activeGroupId={activeGroup?.id ?? null}
            dropIntent={tabMove.dropIntent}
            groups={groups}
            hosts={sessionHosts}
            root={root}
            runtimeRegistry={runtimeRegistry}
            sessions={sessions}
            sessionMove={tabMove}
            workspacePath={workspace.path}
            onActivateSession={activateSession}
            onCloseSession={requestCloseSession}
            onCreateSession={(groupId) => createLauncher(groupId)}
            onMoveByKeyboard={moveSessionByKeyboard}
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
