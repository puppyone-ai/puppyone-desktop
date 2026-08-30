import type { DragEventHandler, ReactNode } from "react";

type AgentPanelLayoutProps = {
  ariaLabel: string;
  phase?: string;
  header?: ReactNode;
  status?: ReactNode;
  conversation: ReactNode;
  dock?: ReactNode;
  dropActive?: boolean;
  dropInvalid?: boolean;
  dropLabel?: string;
  announcement?: string;
  onDragEnter?: DragEventHandler<HTMLElement>;
  onDragOver?: DragEventHandler<HTMLElement>;
  onDragLeave?: DragEventHandler<HTMLElement>;
  onDrop?: DragEventHandler<HTMLElement>;
};

/**
 * Structural boundary for Agent Chat.
 *
 * The layout owns panel geometry and spacing. Feature components only own their
 * internal presentation, which keeps transcript scrolling, dock spacing and
 * container-query behavior independent from session/controller state.
 */
export function AgentPanelLayout({
  ariaLabel,
  phase,
  header,
  status = null,
  conversation,
  dock,
  dropActive = false,
  dropInvalid = false,
  dropLabel = "",
  announcement = "",
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
}: AgentPanelLayoutProps) {
  return (
    <section
      className="desktop-agent-boundary"
      aria-label={ariaLabel}
      data-phase={phase}
      data-drop-active={dropActive ? "true" : "false"}
      data-drop-valid={dropInvalid ? "false" : "true"}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="desktop-agent-panel">
        {header != null && <div className="desktop-agent-header-region">{header}</div>}
        {status && <div className="desktop-agent-status-region">{status}</div>}
        <div className="desktop-agent-conversation-region">{conversation}</div>
        {dock != null && <div className="desktop-agent-dock-region">{dock}</div>}
      </div>
      {dropActive && <div className={`desktop-agent-reference-drop-overlay${dropInvalid ? " is-invalid" : ""}`} aria-hidden="true"><span>{dropLabel}</span></div>}
      {announcement && <div className="desktop-agent-announcer" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>}
    </section>
  );
}
