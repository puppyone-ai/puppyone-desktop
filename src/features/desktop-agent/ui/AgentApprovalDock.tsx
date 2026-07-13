import { ShieldAlert } from "lucide-react";
import { bidiIsolate } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import type { AgentApproval } from "../domain/agent-projection-types";
import type { AgentApprovalDecision } from "../domain/agent-contract";

type AgentApprovalDockProps = {
  approval: AgentApproval;
  queueLength: number;
  resolving: boolean;
  onResolve: (decision: AgentApprovalDecision) => void;
  runtimeLabel?: string;
};

export function AgentApprovalDock({ approval, queueLength, resolving, onResolve, runtimeLabel: runtimeLabelProp }: AgentApprovalDockProps) {
  const { t } = useLocalization();
  const runtimeLabel = runtimeLabelProp || t("agent.name");
  const canAllowForSession = approval.availableDecisions.includes("acceptForSession");
  return (
    <section className="desktop-agent-approval" aria-label={t("agent.approval.ariaLabel", { agent: bidiIsolate(runtimeLabel) })} aria-live="polite">
      <div className="desktop-agent-approval-heading">
        <ShieldAlert size={15} />
        <strong dir="auto">{approval.title || t("agent.approval.required")}</strong>
        {queueLength > 1 && <small>{t("agent.approval.pending", { count: queueLength })}</small>}
      </div>
      {approval.command && <code>{approval.command}</code>}
      {approval.cwd && <div className="desktop-agent-approval-scope">{t("agent.approval.inPath", { path: bidiIsolate(approval.cwd) })}</div>}
      {approval.networkApprovalContext && (
        <div className="desktop-agent-approval-material">
          <span>{t("agent.approval.networkTarget")}</span>
          <code dir="ltr">{approval.networkApprovalContext.protocol}://{approval.networkApprovalContext.host}</code>
        </div>
      )}
      {approval.grantRoot && (
        <div className="desktop-agent-approval-material">
          <span>{t("agent.approval.writeScope")}</span>
          <code dir="ltr">{approval.grantRoot}</code>
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
        <p className="desktop-agent-approval-policy-note">{t("agent.approval.policyNote", { agent: bidiIsolate(runtimeLabel) })}</p>
      )}
      <div className="desktop-agent-approval-actions">
        <button
          type="button"
          className="desktop-agent-button is-secondary"
          disabled={resolving}
          onClick={() => onResolve("decline")}
          autoFocus
        >
          {t("agent.approval.deny")}
        </button>
        {canAllowForSession && (
          <button
            type="button"
            className="desktop-agent-button is-secondary"
            disabled={resolving}
            onClick={() => onResolve("acceptForSession")}
          >
            {t("agent.approval.allowSession")}
          </button>
        )}
        <button
          type="button"
          className="desktop-agent-button is-primary"
          disabled={resolving}
          onClick={() => onResolve("accept")}
        >
          {t("agent.approval.allowOnce")}
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
