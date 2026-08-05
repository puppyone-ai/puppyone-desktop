import {
  forwardRef,
  useImperativeHandle,
  useRef,
  type ForwardedRef,
} from "react";
import type { Workspace } from "@puppyone/shared-ui";
import { useLocalization } from "@puppyone/localization/react";
import type { TerminalSessionLayout } from "../../../preferences";
import { useTerminalSessions } from "../controller/useTerminalSessions";
import type { DesktopTerminalSessionSnapshot } from "../model/terminalSessions";
import { useTerminalAppearanceSync } from "../runtime/useTerminalAppearanceSync";
import { TerminalCloseConfirmationDialog } from "./TerminalCloseConfirmationDialog";
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
    createSession,
    pendingCloseSession,
    requestCloseSession,
    runtimeRegistry,
    sessions,
  } = useTerminalSessions({
    initiallyActive: active,
    messageFormatter: t,
    onSessionsChange,
    workspacePath: workspace.path,
  });

  useTerminalAppearanceSync(panelRef, runtimeRegistry);
  useImperativeHandle(ref, () => ({
    create: createSession,
    activate: activateSession,
    close: requestCloseSession,
  }), [activateSession, createSession, requestCloseSession]);

  return (
    <section
      ref={panelRef}
      className="desktop-terminal-panel"
      aria-label={t("terminal.title")}
    >
      {sessionLayout === "tabs" && (
        <TerminalSessionTabs
          sessions={sessions}
          activeSessionId={activeSessionId}
          onActivate={activateSession}
          onClose={requestCloseSession}
          onCreate={createSession}
          runtimeRegistry={runtimeRegistry}
        />
      )}
      <div className={`desktop-terminal-body ${sessions.length === 0 ? "is-empty" : ""}`}>
        {sessions.length === 0 ? (
          <div className="desktop-terminal-empty-state">
            <span>{t("terminal.empty")}</span>
          </div>
        ) : sessions.map((session) => (
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
