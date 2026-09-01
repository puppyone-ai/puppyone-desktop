import type { DragEventHandler, ReactNode } from "react";

type AgentPanelLayoutProps = {
  ariaLabel: string;
  phase?: string;
  header?: ReactNode;
  status?: ReactNode;
  conversation: ReactNode;
  conversationOverlay?: ReactNode;
  dock?: ReactNode;
  announcement?: string;
  onDragOver?: DragEventHandler<HTMLElement>;
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
  conversationOverlay = null,
  dock,
  announcement = "",
  onDragOver,
  onDrop,
}: AgentPanelLayoutProps) {
  return (
    <section
      className="desktop-agent-boundary"
      aria-label={ariaLabel}
      data-phase={phase}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="desktop-agent-panel">
        {header != null && <div className="desktop-agent-header-region">{header}</div>}
        {status && <div className="desktop-agent-status-region">{status}</div>}
        <div className="desktop-agent-conversation-region">{conversation}</div>
        {conversationOverlay && (
          <div className={`desktop-agent-conversation-overlay${dock != null ? " has-dock" : ""}`}>{conversationOverlay}</div>
        )}
        {dock != null && <div className="desktop-agent-dock-region">{dock}</div>}
      </div>
      {announcement && <div className="desktop-agent-announcer" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>}
    </section>
  );
}
