import { ShieldAlert } from "lucide-react";
import type { AgentApproval } from "./agentProjection";
import type { AgentApprovalDecision } from "./agentTypes";

type AgentApprovalDockProps = {
  approval: AgentApproval;
  queueLength: number;
  resolving: boolean;
  onResolve: (decision: AgentApprovalDecision) => void;
};

export function AgentApprovalDock({ approval, queueLength, resolving, onResolve }: AgentApprovalDockProps) {
  const canAllowForSession = approval.availableDecisions.includes("acceptForSession");
  return (
    <section className="desktop-agent-approval" aria-label="Codex approval required">
      <div className="desktop-agent-approval-heading">
        <ShieldAlert size={15} />
        <strong>{approval.title}</strong>
        {queueLength > 1 && <small>{queueLength} pending</small>}
      </div>
      {approval.command && <code>{approval.command}</code>}
      {approval.cwd && <div className="desktop-agent-approval-scope">in {approval.cwd}</div>}
      {approval.reason && <p>{approval.reason}</p>}
      <div className="desktop-agent-approval-actions">
        <button
          type="button"
          className="desktop-agent-button is-secondary"
          disabled={resolving}
          onClick={() => onResolve("decline")}
          autoFocus
        >
          Deny
        </button>
        {canAllowForSession && (
          <button
            type="button"
            className="desktop-agent-button is-secondary"
            disabled={resolving}
            onClick={() => onResolve("acceptForSession")}
          >
            Allow for session
          </button>
        )}
        <button
          type="button"
          className="desktop-agent-button is-primary"
          disabled={resolving}
          onClick={() => onResolve("accept")}
        >
          Allow once
        </button>
      </div>
    </section>
  );
}
