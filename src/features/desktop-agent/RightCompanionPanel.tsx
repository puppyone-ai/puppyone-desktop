import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import type { Workspace } from "@puppyone/shared-ui";
import { RightTerminalPanel, type RightTerminalPanelHandle } from "../../components/RightTerminalPanel";
import { RightAgentPanel, type RightAgentPanelHandle } from "./RightAgentPanel";

export type RightCompanionSurface = "chat" | "terminal";

export type RightCompanionPanelHandle = {
  clear: () => void;
  newSession: () => void;
};

type RightCompanionPanelProps = {
  workspace: Workspace;
  active: boolean;
  surface: RightCompanionSurface;
  terminalResetToken: number;
  preferredModel?: string | null;
  onPreferredModelChange?: (model: string) => void;
  onSurfaceChange: (surface: RightCompanionSurface) => void;
  onViewChanges?: () => void;
};

export const RightCompanionPanel = forwardRef<RightCompanionPanelHandle, RightCompanionPanelProps>(function RightCompanionPanel(
  {
    workspace,
    active,
    surface,
    terminalResetToken,
    preferredModel = null,
    onPreferredModelChange,
    onSurfaceChange,
    onViewChanges,
  },
  ref,
) {
  const terminalRef = useRef<RightTerminalPanelHandle | null>(null);
  const agentRef = useRef<RightAgentPanelHandle | null>(null);
  const [chatTurnRunning, setChatTurnRunning] = useState(false);

  useImperativeHandle(ref, () => ({
    clear: () => terminalRef.current?.clear(),
    newSession: () => agentRef.current?.newSession(),
  }), []);

  const showChatActivity = chatTurnRunning && surface === "terminal";

  return (
    <section className="desktop-companion-panel" aria-label="Workspace companion">
      <div className="desktop-companion-tabs" role="tablist" aria-label="Right sidebar surface">
        <button
          type="button"
          role="tab"
          aria-selected={surface === "chat"}
          className={surface === "chat" ? "is-active" : ""}
          onClick={() => onSurfaceChange("chat")}
        >
          <span>Chat</span>
          {showChatActivity && (
            <span
              className="desktop-companion-tab-activity"
              aria-label="Codex turn running"
              title="Codex turn running"
            />
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={surface === "terminal"}
          className={surface === "terminal" ? "is-active" : ""}
          onClick={() => onSurfaceChange("terminal")}
        >
          Terminal
        </button>
      </div>
      <div
        className={`desktop-companion-surface ${surface === "chat" ? "is-active" : ""}`}
        role="tabpanel"
        aria-label="Chat"
        aria-hidden={surface !== "chat"}
      >
        <RightAgentPanel
          ref={agentRef}
          workspace={workspace}
          active={active && surface === "chat"}
          preferredModel={preferredModel}
          onPreferredModelChange={onPreferredModelChange}
          onRunningChange={setChatTurnRunning}
          onViewChanges={onViewChanges}
        />
      </div>
      <div
        className={`desktop-companion-surface ${surface === "terminal" ? "is-active" : ""}`}
        role="tabpanel"
        aria-label="Terminal"
        aria-hidden={surface !== "terminal"}
      >
        <RightTerminalPanel
          key={`${workspace.path}:${terminalResetToken}`}
          ref={terminalRef}
          workspace={workspace}
          active={active && surface === "terminal"}
        />
      </div>
    </section>
  );
});
