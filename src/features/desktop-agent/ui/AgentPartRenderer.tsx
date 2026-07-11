import { Check, Copy } from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";
import type { AgentPart } from "../domain/agent-projection-types";
import { AgentActivityItem } from "./AgentActivityItem";
import { SafeMarkdown } from "./SafeMarkdown";
import { AgentToolRenderer, isAgentToolPart } from "./AgentToolRendererRegistry";

type PartRendererProps = { part: AgentPart; runtimeLabel: string; onViewChanges?: () => void };

const registry = new Map<AgentPart["kind"], ComponentType<PartRendererProps>>();

export function registerAgentPartRenderer(kind: AgentPart["kind"], renderer: ComponentType<PartRendererProps>) {
  registry.set(kind, renderer);
}

export function AgentPartRenderer(props: PartRendererProps) {
  const Renderer = registry.get(props.part.kind) ?? UnknownPart;
  return <Renderer {...props} />;
}

function MessagePart({ part, runtimeLabel }: PartRendererProps) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 1_200);
    return () => window.clearTimeout(timer);
  }, [copied]);
  if (part.kind !== "user" && part.kind !== "assistant") return null;
  const copy = async () => {
    if (!part.text || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(part.text);
      setCopied(true);
    } catch {
      // Clipboard access is optional in hardened renderer contexts.
    }
  };
  return (
    <article className={`desktop-agent-message is-${part.kind}`} aria-label={part.kind === "user" ? "You" : runtimeLabel}>
      {part.kind === "assistant"
        ? <SafeMarkdown text={part.text || (part.streaming ? "…" : "")} streaming={part.streaming} />
        : <div className="desktop-agent-message-text">{part.text}</div>}
      {part.kind === "assistant" && (Boolean(part.text) || part.terminalState) && (
        <footer className="desktop-agent-message-actions">
          {Boolean(part.text) && !part.streaming && (
            <button type="button" aria-label={copied ? "Response copied" : "Copy response"} title={copied ? "Copied" : "Copy response"} onClick={() => void copy()}>
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
          )}
          {part.terminalState && part.terminalState !== "completed" && (
            <span className={`desktop-agent-message-state is-${part.terminalState}`}>{part.terminalState}</span>
          )}
        </footer>
      )}
    </article>
  );
}

function ActivityPart({ part, onViewChanges }: PartRendererProps) {
  if (!("label" in part) || !("status" in part) || !("detail" in part)) return null;
  if (isAgentToolPart(part)) {
    return <AgentToolRenderer part={part} onViewChanges={onViewChanges} />;
  }
  return <AgentActivityItem activity={{
    id: part.id,
    turnId: part.turnId,
    itemId: part.itemId,
    kind: part.kind,
    label: part.label,
    status: part.status,
    detail: part.detail,
    output: part.output,
    sequence: part.sequence,
  }} onViewChanges={onViewChanges} />;
}

function StatusPart({ part }: PartRendererProps) {
  if (part.kind === "usage") return null;
  if (part.kind === "permission" || part.kind === "question") {
    return <div className="desktop-agent-inline-part" role="status">{part.kind === "permission" ? "Permission" : "Question"} {part.state}</div>;
  }
  return <UnknownPart part={part} runtimeLabel="Agent" />;
}

function UnknownPart({ part }: PartRendererProps) {
  return <div className="desktop-agent-inline-part is-muted">{"eventType" in part ? part.label : "Agent update"}</div>;
}

registerAgentPartRenderer("user", MessagePart);
registerAgentPartRenderer("assistant", MessagePart);
for (const kind of ["reasoning", "plan", "tool", "command", "file-change", "warning", "error"] as const) {
  registerAgentPartRenderer(kind, ActivityPart);
}
registerAgentPartRenderer("usage", StatusPart);
registerAgentPartRenderer("permission", StatusPart);
registerAgentPartRenderer("question", StatusPart);
registerAgentPartRenderer("unknown", UnknownPart);
