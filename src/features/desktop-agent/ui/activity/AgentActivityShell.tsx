import { Check, ChevronDown, Circle, CircleAlert, CircleSlash2, LoaderCircle } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useLocalization } from "@puppyone/localization/react";
import type { AgentActivityStatus } from "../../domain/agent-projection-types";

type AgentActivityShellProps = {
  title: string;
  summary?: string;
  status: AgentActivityStatus;
  icon: ReactNode;
  children?: ReactNode;
  className?: string;
  defaultExpanded?: boolean;
};

export function AgentActivityShell({
  title,
  summary,
  status,
  icon,
  children,
  className = "",
  defaultExpanded = false,
}: AgentActivityShellProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasDetail = children !== undefined && children !== null && children !== false && children !== "";
  return (
    <div className={`desktop-agent-tool-call is-${status}${hasDetail ? " has-detail" : ""}${expanded ? " is-expanded" : ""} ${className}`.trim()}>
      <div className="desktop-agent-tool-header">
        <button
          type="button"
          className="desktop-agent-tool-row"
          disabled={!hasDetail}
          aria-expanded={hasDetail ? expanded : undefined}
          onClick={() => hasDetail && setExpanded((value) => !value)}
        >
          <span className="desktop-agent-tool-icon" aria-hidden="true">{icon}</span>
          <strong className="desktop-agent-tool-name">{title}</strong>
          {hasDetail && <ChevronDown className={`desktop-agent-tool-chevron${expanded ? " is-expanded" : ""}`} size={12} aria-hidden="true" />}
          {summary && <span className="desktop-agent-tool-summary">{summary}</span>}
          <StatusIcon status={status} />
        </button>
      </div>
      {expanded && hasDetail && <div className="desktop-agent-tool-branch">{children}</div>}
    </div>
  );
}

function StatusIcon({ status }: { status: AgentActivityStatus }) {
  const { t } = useLocalization();
  if (["running", "pending", "in-progress"].includes(status)) {
    return <LoaderCircle className="desktop-agent-tool-status desktop-agent-spin" size={12} aria-label={t("agent.status.running")} />;
  }
  if (["failed", "warning", "blocked"].includes(status)) {
    return <CircleAlert className="desktop-agent-tool-status is-failed" size={12} aria-label={t(`agent.status.${status === "warning" ? "warning" : "failed"}`)} />;
  }
  if (status === "completed" || status === "succeeded") {
    return <Check className="desktop-agent-tool-status is-completed" size={12} aria-label={t("agent.status.completed")} />;
  }
  if (status === "cancelled" || status === "interrupted") {
    return <CircleSlash2 className="desktop-agent-tool-status" size={12} aria-label={t("agent.status.stopped")} />;
  }
  const label = status === "queued"
    ? t("agent.status.queued")
    : status === "waiting-for-user"
      ? t("agent.status.waitingForUser")
      : t("agent.status.unknown");
  return <Circle className="desktop-agent-tool-status" size={12} aria-label={label} />;
}
