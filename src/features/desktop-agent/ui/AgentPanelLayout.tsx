import type { ReactNode } from "react";

type AgentPanelLayoutProps = {
  ariaLabel: string;
  phase?: string;
  header?: ReactNode;
  status?: ReactNode;
  conversation: ReactNode;
  dock?: ReactNode;
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
}: AgentPanelLayoutProps) {
  return (
    <section className="desktop-agent-boundary" aria-label={ariaLabel} data-phase={phase}>
      <div className="desktop-agent-panel">
        {header != null && <div className="desktop-agent-header-region">{header}</div>}
        {status && <div className="desktop-agent-status-region">{status}</div>}
        <div className="desktop-agent-conversation-region">{conversation}</div>
        {dock != null && <div className="desktop-agent-dock-region">{dock}</div>}
      </div>
    </section>
  );
}
