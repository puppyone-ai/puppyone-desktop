import { Check, ChevronDown, CircleAlert, LoaderCircle } from "lucide-react";
import { useState, type ReactNode } from "react";

type AgentActivityShellProps = {
  title: string;
  summary?: string;
  meta?: string | null;
  status: string;
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
  const normalizedStatus = status === "error" ? "failed" : status;
  return (
    <div className={`desktop-agent-tool-call is-${normalizedStatus} ${className}`.trim()}>
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
          <StatusIcon status={normalizedStatus} />
          {hasDetail && <ChevronDown className={`desktop-agent-tool-chevron${expanded ? " is-expanded" : ""}`} size={12} aria-hidden="true" />}
        </button>
        {actions}
      </div>
      {expanded && hasDetail && <div className="desktop-agent-tool-branch">{children}</div>}
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (["running", "pending", "in-progress"].includes(status)) {
    return <LoaderCircle className="desktop-agent-tool-status desktop-agent-spin" size={12} aria-label="Running" />;
  }
  if (["failed", "warning", "blocked"].includes(status)) {
    return <CircleAlert className="desktop-agent-tool-status is-failed" size={12} aria-label={status === "warning" ? "Warning" : "Failed"} />;
  }
  return <Check className="desktop-agent-tool-status is-completed" size={12} aria-label="Completed" />;
}
