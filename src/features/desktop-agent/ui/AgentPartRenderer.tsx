import type { ComponentType } from "react";
import type { AgentPart } from "../domain/agent-projection-types";
import { AgentActivityItem } from "./AgentActivityItem";
import { AgentMessagePart } from "./AgentMessagePart";
import { AgentToolRenderer, isAgentToolPart } from "./AgentToolRendererRegistry";
import { AgentTurnSummary } from "./AgentTurnSummary";

type PartRendererProps = {
  part: AgentPart;
  runtimeLabel: string;
  onOpenFile?: (path: string) => void;
};

const registry = new Map<AgentPart["kind"], ComponentType<PartRendererProps>>();

export function registerAgentPartRenderer(kind: AgentPart["kind"], renderer: ComponentType<PartRendererProps>) {
  registry.set(kind, renderer);
}

export function AgentPartRenderer(props: PartRendererProps) {
  const Renderer = registry.get(props.part.kind) ?? UnknownPart;
  return <Renderer {...props} />;
}

function MessagePart({ part, runtimeLabel }: PartRendererProps) {
  if (part.kind !== "user" && part.kind !== "assistant") return null;
  return <AgentMessagePart part={part} runtimeLabel={runtimeLabel} />;
}

function ActivityPart({ part, onOpenFile }: PartRendererProps) {
  if (!("label" in part) || !("status" in part) || !("detail" in part)) return null;
  if (isAgentToolPart(part)) {
    return <AgentToolRenderer part={part} onOpenFile={onOpenFile} />;
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
  }} onOpenFile={onOpenFile} />;
}

function StatusPart({ part }: PartRendererProps) {
  if (part.kind === "usage") return null;
  if (part.kind === "permission" || part.kind === "question") {
    return <div className="desktop-agent-inline-part" role="status">{part.kind === "permission" ? "Permission" : "Question"} {part.state}</div>;
  }
  return <UnknownPart part={part} runtimeLabel="Agent" />;
}

function TurnSummaryPart({ part }: PartRendererProps) {
  if (part.kind !== "turn-summary") return null;
  return <AgentTurnSummary durationMs={part.durationMs} status={part.status} />;
}

function UnknownPart({ part }: PartRendererProps) {
  return <div className="desktop-agent-inline-part is-muted">{"eventType" in part ? part.label : "Agent update"}</div>;
}

registerAgentPartRenderer("user", MessagePart);
registerAgentPartRenderer("assistant", MessagePart);
registerAgentPartRenderer("turn-summary", TurnSummaryPart);
for (const kind of ["reasoning", "plan", "tool", "command", "file-change", "warning", "error"] as const) {
  registerAgentPartRenderer(kind, ActivityPart);
}
registerAgentPartRenderer("usage", StatusPart);
registerAgentPartRenderer("permission", StatusPart);
registerAgentPartRenderer("question", StatusPart);
registerAgentPartRenderer("unknown", UnknownPart);
