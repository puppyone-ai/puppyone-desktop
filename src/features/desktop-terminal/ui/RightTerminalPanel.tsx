import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  type ForwardedRef,
} from "react";
import type { Workspace } from "@puppyone/shared-ui";
import { useLocalization } from "@puppyone/localization/react";
import type { TerminalSessionLayout } from "../../../preferences";
import { useInstalledTerminalAgents } from "../controller/useInstalledTerminalAgents";
import { useTerminalSessions } from "../controller/useTerminalSessions";
import type { DesktopTerminalLauncherId } from "../model/terminalLaunchers";
import type { DesktopTerminalSessionSnapshot } from "../model/terminalSessions";
import { useTerminalAppearanceSync } from "../runtime/useTerminalAppearanceSync";
import { TerminalCloseConfirmationDialog } from "./TerminalCloseConfirmationDialog";
import { TerminalLauncher } from "./TerminalLauncher";
import { TerminalSessionTabs, terminalPanelId, terminalTabId } from "./TerminalSessionTabs";
import { TerminalSessionView } from "./TerminalSessionView";
import "@xterm/xterm/css/xterm.css";
import "./desktop-terminal.css";

type RightTerminalPanelProps = {
  workspace: Workspace;
  active: boolean;
  sessionLayout: TerminalSessionLayout;
  onSessionsChange: (snapshot: DesktopTerminalSessionSnapshot) => void;
};

export type RightTerminalPanelHandle = {
  create: () => void;
  activate: (sessionId: string) => void;
  close: (sessionId: string) => void;
};

function RightTerminalPanelComponent(
  { workspace, active, sessionLayout, onSessionsChange }: RightTerminalPanelProps,
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
    && (sessions.length === 0 || activeSession?.status === "selecting");
  const installedAgents = useInstalledTerminalAgents({
    enabled: launcherVisible,
    workspacePath: workspace.path,
  });
  const canLaunch = useCallback((launcherId: DesktopTerminalLauncherId) => (
    launcherId === "shell" || installedAgents.ids.includes(launcherId)
  ), [installedAgents.ids]);
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
        <TerminalSessionTabs
          sessions={sessions}
          activeSessionId={activeSessionId}
          onActivate={activateSession}
          onClose={requestCloseSession}
          onCreate={createLauncher}
          runtimeRegistry={runtimeRegistry}
        />
      )}
      <div className={`desktop-terminal-body ${sessions.length === 0 ? "is-empty" : ""} ${activeSession?.status === "selecting" ? "is-launcher" : ""}`}>
        {sessions.length === 0 ? (
          <TerminalLauncher
            discoveryPhase={installedAgents.phase}
            installedAgentIds={installedAgents.ids}
            onLaunch={createDetectedSession}
            onRefresh={() => void installedAgents.refresh()}
          />
        ) : sessions.map((session) => session.status === "selecting" ? (
          <div
            key={session.id}
            id={sessionLayout === "tabs" ? terminalPanelId(session.id) : undefined}
            className="desktop-terminal-launcher-tab"
            role={sessionLayout === "tabs" ? "tabpanel" : undefined}
            aria-labelledby={sessionLayout === "tabs" ? terminalTabId(session.id) : undefined}
            hidden={!active || activeSessionId !== session.id}
          >
            <TerminalLauncher
              discoveryPhase={installedAgents.phase}
              installedAgentIds={installedAgents.ids}
              onLaunch={(launcherId) => launchDetectedSession(session.id, launcherId)}
              onRefresh={() => void installedAgents.refresh()}
            />
          </div>
        ) : (
          <TerminalSessionView
            key={session.id}
            active={active && activeSessionId === session.id}
            labelledBy={sessionLayout === "tabs" ? terminalTabId(session.id) : undefined}
            panelId={sessionLayout === "tabs" ? terminalPanelId(session.id) : undefined}
            runtime={runtimeRegistry.require(session.id)}
            workspacePath={workspace.path}
          />
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
