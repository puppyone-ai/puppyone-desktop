import { useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";
import type { AgentProjection } from "./agentProjection";
import { AgentMessage } from "./AgentMessage";
import { AgentActivityItem } from "./AgentActivityItem";

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
          <AgentMessage message={entry.message} key={entry.message.id} />
        ) : (
          <AgentActivityItem activity={entry.activity} key={entry.activity.id} onViewChanges={onViewChanges} />
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
