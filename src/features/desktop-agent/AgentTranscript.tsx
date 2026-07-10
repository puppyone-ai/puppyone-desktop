import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Circle, CircleAlert, FilePenLine, LoaderCircle, TerminalSquare } from "lucide-react";
import type { AgentActivity, AgentProjection } from "./agentProjection";

type AgentTranscriptProps = {
  projection: AgentProjection;
  loading: boolean;
  onViewChanges?: () => void;
};

export function AgentTranscript({ projection, loading, onViewChanges }: AgentTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  const entries = useMemo(() => [
    ...projection.messages.map((message) => ({ kind: "message" as const, sequence: message.sequence, message })),
    ...projection.activities.map((activity) => ({ kind: "activity" as const, sequence: activity.sequence, activity })),
  ].sort((left, right) => left.sequence - right.sequence), [projection.activities, projection.messages]);

  useEffect(() => {
    if (!pinned) return;
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [entries, pinned, projection.approvals.length]);

  const handleScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    setPinned(element.scrollHeight - element.scrollTop - element.clientHeight < 36);
  };

  return (
    <div className="desktop-agent-transcript-wrap">
      <div
        className="desktop-agent-transcript"
        ref={scrollRef}
        onScroll={handleScroll}
        aria-label="Codex conversation"
        tabIndex={0}
      >
        {projection.partialHistory && (
          <div className="desktop-agent-history-warning" role="status">
            <CircleAlert size={14} /> Part of this session history is unavailable.
          </div>
        )}
        {entries.length === 0 && !loading && (
          <div className="desktop-agent-empty">
            <div className="desktop-agent-empty-mark">P1</div>
            <strong>Work with Codex</strong>
            <p>Ask about this workspace, plan a change, run commands, or edit files. PuppyOne will pause for approvals.</p>
          </div>
        )}
        {loading && entries.length === 0 && (
          <div className="desktop-agent-loading" role="status">
            <LoaderCircle size={15} className="desktop-agent-spin" /> Restoring Codex…
          </div>
        )}
        {entries.map((entry) => entry.kind === "message" ? (
          <article
            className={`desktop-agent-message is-${entry.message.role}`}
            key={entry.message.id}
          >
            <div className="desktop-agent-message-role">{entry.message.role === "user" ? "You" : "Codex"}</div>
            <div className="desktop-agent-message-text">{entry.message.text || (entry.message.streaming ? "…" : "")}</div>
            {entry.message.terminalState && entry.message.terminalState !== "completed" && (
              <div className={`desktop-agent-message-state is-${entry.message.terminalState}`}>
                {entry.message.terminalState}
              </div>
            )}
          </article>
        ) : (
          <AgentActivityRow activity={entry.activity} key={entry.activity.id} onViewChanges={onViewChanges} />
        ))}
        <div
          className="desktop-agent-announcer"
          aria-live="polite"
          aria-atomic="true"
        >
          {projection.terminalState ? `Codex turn ${projection.terminalState}.` : ""}
        </div>
      </div>
      {!pinned && entries.length > 0 && (
        <button
          className="desktop-agent-jump-latest"
          type="button"
          onClick={() => {
            const element = scrollRef.current;
            if (element) element.scrollTop = element.scrollHeight;
            setPinned(true);
          }}
        >
          Jump to latest
        </button>
      )}
    </div>
  );
}

function AgentActivityRow({ activity, onViewChanges }: { activity: AgentActivity; onViewChanges?: () => void }) {
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
    <div className={`desktop-agent-activity is-${activity.status}`}>
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
      {expanded && (
        <div className="desktop-agent-activity-detail">
          {activity.output && <pre>{activity.output}</pre>}
          {!activity.output && <ActivityDetails detail={activity.detail} />}
          {activity.kind === "file-change" && onViewChanges && (
            <button type="button" className="desktop-agent-view-changes" onClick={onViewChanges}>View changes</button>
          )}
        </div>
      )}
    </div>
  );
}

function ActivityDetails({ detail }: { detail: Record<string, unknown> }) {
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
  const command = typeof detail.command === "string" ? detail.command : null;
  const reasoning = typeof detail.delta === "string" ? detail.delta : null;
  const steps = Array.isArray(detail.steps) ? detail.steps : [];
  if (steps.length > 0) {
    return (
      <ol>
        {steps.map((step, index) => {
          const value = step && typeof step === "object" ? step as Record<string, unknown> : {};
          return <li key={index}>{String(value.step ?? "")} <small>{String(value.status ?? "")}</small></li>;
        })}
      </ol>
    );
  }
  return <pre>{command || reasoning || JSON.stringify(detail, null, 2)}</pre>;
}
