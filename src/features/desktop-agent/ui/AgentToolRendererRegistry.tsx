import type { ComponentType } from "react";
import type { AgentPart } from "../domain/agent-projection-types";
import { AgentActivityItem } from "./AgentActivityItem";

type AgentActivityPart = Extract<AgentPart, { label: string }>;
export type AgentToolPart = AgentActivityPart & { kind: "tool" | "command" | "file-change" };
type ToolRendererProps = { part: AgentToolPart; onViewChanges?: () => void };

const renderers = new Map<string, ComponentType<ToolRendererProps>>();

export function registerAgentToolRenderer(tool: string, renderer: ComponentType<ToolRendererProps>) {
  renderers.set(tool, renderer);
}

export function isAgentToolPart(part: AgentPart): part is AgentToolPart {
  return part.kind === "tool" || part.kind === "command" || part.kind === "file-change";
}

export function AgentToolRenderer({ part, onViewChanges }: ToolRendererProps) {
  const tool = typeof part.detail.tool === "string" ? part.detail.tool : part.kind;
  const Renderer = renderers.get(tool) || renderers.get(part.kind) || DefaultToolRenderer;
  return <Renderer part={part} onViewChanges={onViewChanges} />;
}

function DefaultToolRenderer({ part, onViewChanges }: ToolRendererProps) {
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

registerAgentToolRenderer("tool", DefaultToolRenderer);
registerAgentToolRenderer("command", DefaultToolRenderer);
registerAgentToolRenderer("file-change", DefaultToolRenderer);
