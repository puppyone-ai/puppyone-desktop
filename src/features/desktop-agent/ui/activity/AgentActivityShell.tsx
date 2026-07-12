import { Check, ChevronDown, Circle, CircleAlert, CircleSlash2, LoaderCircle } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { AgentActivityStatus } from "../../domain/agent-projection-types";

type AgentActivityShellProps = {
  title: string;
  summary?: string;
  meta?: string | null;
  status: AgentActivityStatus;
  icon: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
  defaultExpanded?: boolean;
};

export function AgentActivityShell({
  title,
  summary,
  meta,
  status,
  icon,
  children,
  actions,
  className = "",
  defaultExpanded = false,
}: AgentActivityShellProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasDetail = children !== undefined && children !== null && children !== false && children !== "";
  return (
    <div className={`desktop-agent-tool-call is-${status} ${className}`.trim()}>
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
          {summary && <span className="desktop-agent-tool-summary">{summary}</span>}
          {meta && <small className="desktop-agent-tool-meta">{meta}</small>}
          <StatusIcon status={status} />
          {hasDetail && <ChevronDown className={`desktop-agent-tool-chevron${expanded ? " is-expanded" : ""}`} size={12} aria-hidden="true" />}
        </button>
        {actions}
      </div>
      {expanded && hasDetail && <div className="desktop-agent-tool-branch">{children}</div>}
    </div>
  );
}

function StatusIcon({ status }: { status: AgentActivityStatus }) {
  if (["running", "pending", "in-progress"].includes(status)) {
    return <LoaderCircle className="desktop-agent-tool-status desktop-agent-spin" size={12} aria-label="Running" />;
  }
  if (["failed", "warning", "blocked"].includes(status)) {
    return <CircleAlert className="desktop-agent-tool-status is-failed" size={12} aria-label={status === "warning" ? "Warning" : "Failed"} />;
  }
  if (status === "completed" || status === "succeeded") {
    return <Check className="desktop-agent-tool-status is-completed" size={12} aria-label="Completed" />;
  }
  if (status === "cancelled" || status === "interrupted") {
    return <CircleSlash2 className="desktop-agent-tool-status" size={12} aria-label="Stopped" />;
  }
  return <Circle className="desktop-agent-tool-status" size={12} aria-label={status === "queued" ? "Queued" : status === "waiting-for-user" ? "Waiting for user" : "Unknown status"} />;
}
