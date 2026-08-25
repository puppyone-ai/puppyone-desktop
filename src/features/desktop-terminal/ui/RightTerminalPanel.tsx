import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type ForwardedRef,
} from "react";
import type { Workspace } from "@puppyone/shared-ui";
import { useLocalization } from "@puppyone/localization/react";
import type { TerminalSessionLayout } from "../../../preferences";
import { useTerminalAgentLocator } from "../controller/useTerminalAgentLocator";
import { useTerminalSessions } from "../controller/useTerminalSessions";
import type { DesktopTerminalLauncherId } from "../model/terminalLaunchers";
import type { DesktopTerminalSessionSnapshot } from "../model/terminalSessions";
import { useTerminalAppearanceSync } from "../runtime/useTerminalAppearanceSync";
import { TerminalCloseConfirmationDialog } from "./TerminalCloseConfirmationDialog";
import { TerminalLauncher } from "./TerminalLauncher";
import { TerminalSessionHost } from "./TerminalSessionHost";
import { TerminalSessionHeader } from "./session-header/TerminalSessionHeader";
import {
  terminalPanelId,
  terminalTabId,
} from "./session-header/terminalSessionHeaderIds";
import "@xterm/xterm/css/xterm.css";
import "./desktop-terminal.css";

type RightTerminalPanelProps = {
  workspace: Workspace;
  active: boolean;
  sessionLayout: TerminalSessionLayout;
  hiddenAgentIds: readonly string[];
  onSessionsChange: (snapshot: DesktopTerminalSessionSnapshot) => void;
};

export type RightTerminalPanelHandle = {
  create: () => void;
  activate: (sessionId: string) => void;
  close: (sessionId: string) => void;
};

function RightTerminalPanelComponent(
  { workspace, active, sessionLayout, hiddenAgentIds, onSessionsChange }: RightTerminalPanelProps,
  ref: ForwardedRef<RightTerminalPanelHandle>,
) {
  const { t } = useLocalization();
  const panelRef = useRef<HTMLElement>(null);
  const {
    activeSessionId,
    activateSession,
    cancelCloseSession,
    confirmCloseSession,
    createLauncher,
    createSession,
    launchSession,
    pendingCloseSession,
    requestCloseSession,
    runtimeRegistry,
    sessions,
  } = useTerminalSessions({
    messageFormatter: t,
    onSessionsChange,
    workspacePath: workspace.path,
  });
  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? null;
  const launcherVisible = active
    && (
      sessions.length === 0
      || activeSession?.status === "selecting"
      || activeSession?.status === "starting"
    );
  const {
    ids: availableAgentIds,
    phase: agentDiscoveryPhase,
    refresh: refreshAvailableAgents,
  } = useTerminalAgentLocator({
    enabled: launcherVisible,
  });
  const visibleAgentIds = useMemo(() => {
    const hidden = new Set(hiddenAgentIds);
    return availableAgentIds.filter((agentId) => !hidden.has(agentId));
  }, [availableAgentIds, hiddenAgentIds]);
  const canLaunch = useCallback((launcherId: DesktopTerminalLauncherId) => (
    launcherId === "shell" || visibleAgentIds.includes(launcherId)
  ), [visibleAgentIds]);
  const createDetectedSession = useCallback((launcherId: DesktopTerminalLauncherId) => {
    if (!canLaunch(launcherId)) return;
    createSession(launcherId);
  }, [canLaunch, createSession]);
  const launchDetectedSession = useCallback((
    sessionId: string,
    launcherId: DesktopTerminalLauncherId,
  ) => {
    if (!canLaunch(launcherId)) return;
    launchSession(sessionId, launcherId);
  }, [canLaunch, launchSession]);

  useEffect(() => {
    if (!activeSession?.launchError) return;
    void refreshAvailableAgents();
  }, [activeSession?.launchError, refreshAvailableAgents]);

  useTerminalAppearanceSync(panelRef, runtimeRegistry);
  useImperativeHandle(ref, () => ({
    create: createLauncher,
    activate: activateSession,
    close: requestCloseSession,
  }), [activateSession, createLauncher, requestCloseSession]);

  return (
    <section
      ref={panelRef}
      className="desktop-terminal-panel"
      aria-label={t("terminal.title")}
    >
      {sessionLayout === "tabs" && sessions.length > 0 && (
        <TerminalSessionHeader
          sessions={sessions}
          activeSessionId={activeSessionId}
          onActivate={activateSession}
          onClose={requestCloseSession}
          onCreate={createLauncher}
          runtimeRegistry={runtimeRegistry}
          workspacePath={workspace.path}
        />
      )}
      <div className={`desktop-terminal-body ${sessions.length === 0 ? "is-empty" : ""} ${activeSession?.status === "selecting" || activeSession?.status === "starting" ? "is-launcher" : ""}`}>
        {sessions.length === 0 ? (
          <TerminalLauncher
            discoveryPhase={agentDiscoveryPhase}
            availableAgentIds={visibleAgentIds}
            onLaunch={createDetectedSession}
            onRefresh={() => void refreshAvailableAgents()}
          />
        ) : sessions.map((session) => (
          session.status === "selecting" ? (
              <div
                key={session.id}
                id={sessionLayout === "tabs" ? terminalPanelId(session.id) : undefined}
                className="desktop-terminal-launcher-tab"
                role={sessionLayout === "tabs" ? "tabpanel" : undefined}
                aria-labelledby={sessionLayout === "tabs" ? terminalTabId(session.id) : undefined}
                hidden={!active || activeSessionId !== session.id}
              >
                <TerminalLauncher
                  discoveryPhase={agentDiscoveryPhase}
                  availableAgentIds={visibleAgentIds}
                  launchError={session.launchError}
                  onLaunch={(launcherId) => launchDetectedSession(session.id, launcherId)}
                  onRefresh={() => void refreshAvailableAgents()}
                  titleId={`desktop-terminal-launcher-title-${session.id}`}
                />
              </div>
          ) : (
            <TerminalSessionHost
              key={session.id}
              active={active && activeSessionId === session.id}
              discoveryPhase={agentDiscoveryPhase}
              availableAgentIds={visibleAgentIds}
              labelledBy={sessionLayout === "tabs" ? terminalTabId(session.id) : undefined}
              onLaunch={(launcherId) => launchDetectedSession(session.id, launcherId)}
              onRefresh={() => void refreshAvailableAgents()}
              panelId={sessionLayout === "tabs" ? terminalPanelId(session.id) : undefined}
              runtime={runtimeRegistry.require(session.id)}
              session={session}
              workspacePath={workspace.path}
            />
          )
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

export const RightTerminalPanel = forwardRef<RightTerminalPanelHandle, RightTerminalPanelProps>(
  RightTerminalPanelComponent,
);
