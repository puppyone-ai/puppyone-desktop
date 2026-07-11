import { useState } from "react";
import { Check, ChevronDown, Circle, CircleAlert, FilePenLine, TerminalSquare } from "lucide-react";
import type { AgentActivity } from "../domain/agent-projection-types";
import { AgentPlanItem } from "./AgentPlanItem";

type AgentActivityItemProps = {
  activity: AgentActivity;
  onViewChanges?: () => void;
};

export function AgentActivityItem({ activity, onViewChanges }: AgentActivityItemProps) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = activity.output.length > 0 || Object.keys(activity.detail).length > 0;
  const Icon = activity.kind === "command"
    ? TerminalSquare
    : activity.kind === "file-change"
      ? FilePenLine
      : activity.kind === "error" || activity.kind === "warning"
        ? CircleAlert
        : activity.status === "completed"
          ? Check
          : Circle;
  return (
    <div className={`desktop-agent-activity is-${activity.status}${activity.kind === "file-change" && onViewChanges ? " has-review" : ""}`}>
      <button
        type="button"
        className="desktop-agent-activity-summary"
        disabled={!hasDetail}
        aria-expanded={hasDetail ? expanded : undefined}
        onClick={() => hasDetail && setExpanded((value) => !value)}
      >
        <Icon size={14} aria-hidden="true" />
        <span>{activity.label}</span>
        <small>{activity.status}</small>
        {hasDetail && <ChevronDown size={13} className={expanded ? "is-expanded" : ""} />}
      </button>
      {activity.kind === "file-change" && onViewChanges && (
        <button type="button" className="desktop-agent-review-change" onClick={onViewChanges}>Review</button>
      )}
      {expanded && (
        <div className="desktop-agent-activity-detail">
          {activity.output && <pre>{activity.output}</pre>}
          {!activity.output && <AgentActivityDetail kind={activity.kind} detail={activity.detail} />}
        </div>
      )}
    </div>
  );
}

function AgentActivityDetail({ kind, detail }: { kind: AgentActivity["kind"]; detail: Record<string, unknown> }) {
  const changes = Array.isArray(detail.changes) ? detail.changes : [];
  if (changes.length > 0) {
    return (
      <ul>
        {changes.map((change, index) => {
          const value = change && typeof change === "object" ? change as Record<string, unknown> : {};
          return (
            <li key={`${String(value.path)}:${index}`}>
              <span>{String(value.path ?? "Unknown file")}</span>
              <small>+{String(value.additions ?? 0)} −{String(value.deletions ?? 0)}</small>
            </li>
          );
        })}
      </ul>
    );
  }
  const steps = Array.isArray(detail.steps) ? detail.steps : [];
  if (kind === "plan" && steps.length > 0) {
    return <AgentPlanItem steps={steps.map((step) => {
      const value = step && typeof step === "object" ? step as Record<string, unknown> : {};
      return { step: String(value.step ?? ""), status: String(value.status ?? "pending") };
    })} />;
  }
  const command = typeof detail.command === "string" ? detail.command : null;
  const reasoning = typeof detail.delta === "string" ? detail.delta : null;
  return <pre>{command || reasoning || JSON.stringify(detail, null, 2)}</pre>;
}
