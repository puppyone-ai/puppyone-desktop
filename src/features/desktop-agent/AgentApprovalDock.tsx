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
    <section className="desktop-agent-approval" aria-label="Codex approval required" aria-live="polite">
      <div className="desktop-agent-approval-heading">
        <ShieldAlert size={15} />
        <strong>{approval.title}</strong>
        {queueLength > 1 && <small>{queueLength} pending</small>}
      </div>
      {approval.command && <code>{approval.command}</code>}
      {approval.cwd && <div className="desktop-agent-approval-scope">in {approval.cwd}</div>}
      {approval.networkApprovalContext && (
        <div className="desktop-agent-approval-material">
          <span>Network target</span>
          <code>{approval.networkApprovalContext.protocol}://{approval.networkApprovalContext.host}</code>
        </div>
      )}
      {approval.grantRoot && (
        <div className="desktop-agent-approval-material">
          <span>Requested write scope</span>
          <code>{approval.grantRoot}</code>
        </div>
      )}
      {!approval.command && approval.commandActions.length > 0 && (
        <ul className="desktop-agent-approval-actions-list">
          {approval.commandActions.slice(0, 5).map((action, index) => (
            <li key={`${String(action.type ?? "action")}:${index}`}>{approvalActionLabel(action)}</li>
          ))}
        </ul>
      )}
      {approval.reason && <p>{approval.reason}</p>}
      {approval.policyChangeRequested && (
        <p className="desktop-agent-approval-policy-note">Codex proposed a reusable policy change. This UI will approve only the explicit option you choose below.</p>
      )}
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

function approvalActionLabel(action: Record<string, unknown>) {
  const type = typeof action.type === "string" ? action.type : "action";
  const name = typeof action.name === "string" ? action.name : null;
  const path = typeof action.path === "string" ? action.path : null;
  const command = typeof action.command === "string" ? action.command : null;
  return [name || type, path || command].filter(Boolean).join(": ");
}
