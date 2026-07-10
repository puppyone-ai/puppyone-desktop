import { forwardRef, useImperativeHandle, useRef } from "react";
import type { Workspace } from "@puppyone/shared-ui";
import { RightTerminalPanel, type RightTerminalPanelHandle } from "../../components/RightTerminalPanel";
import { RightAgentPanel } from "./RightAgentPanel";

export type RightCompanionSurface = "chat" | "terminal";

type RightCompanionPanelProps = {
  workspace: Workspace;
  active: boolean;
  surface: RightCompanionSurface;
  terminalResetToken: number;
  onSurfaceChange: (surface: RightCompanionSurface) => void;
  onViewChanges?: () => void;
};

export const RightCompanionPanel = forwardRef<RightTerminalPanelHandle, RightCompanionPanelProps>(function RightCompanionPanel(
  { workspace, active, surface, terminalResetToken, onSurfaceChange, onViewChanges },
  ref,
) {
  const terminalRef = useRef<RightTerminalPanelHandle | null>(null);
  useImperativeHandle(ref, () => ({
    clear: () => terminalRef.current?.clear(),
  }), []);

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
          Chat
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
        <RightAgentPanel workspace={workspace} active={active && surface === "chat"} onViewChanges={onViewChanges} />
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
