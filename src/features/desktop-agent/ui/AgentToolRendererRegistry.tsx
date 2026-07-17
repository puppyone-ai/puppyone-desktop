import type { ComponentType } from "react";
import type { AgentPart } from "../domain/agent-projection-types";
import { AgentActivityItem } from "./AgentActivityItem";
import { AgentCommandActivity, AgentFileChangeActivity, AgentFileQueryActivity, AgentGenericActivity } from "./activity";

type AgentActivityPart = Extract<AgentPart, { label: string }>;
export type AgentToolPart = AgentActivityPart & { kind: "tool" | "command" | "file-change" };
type ToolRendererProps = {
  part: AgentToolPart;
  onOpenFile?: (path: string) => void;
};

const renderers = new Map<string, ComponentType<ToolRendererProps>>();

export function registerAgentToolRenderer(tool: string, renderer: ComponentType<ToolRendererProps>) {
  renderers.set(tool, renderer);
}

export function isAgentToolPart(part: AgentPart): part is AgentToolPart {
  return part.kind === "tool" || part.kind === "command" || part.kind === "file-change";
}

export function AgentToolRenderer({ part, onOpenFile }: ToolRendererProps) {
  const tool = (typeof part.detail.tool === "string" ? part.detail.tool : part.kind).trim().toLowerCase();
  const Renderer = renderers.get(tool) || renderers.get(part.kind) || DefaultToolRenderer;
  return <Renderer part={part} onOpenFile={onOpenFile} />;
}

function DefaultToolRenderer({ part, onOpenFile }: ToolRendererProps) {
  return <AgentActivityItem activity={activityFromPart(part)} onOpenFile={onOpenFile} />;
}

function CommandToolRenderer({ part }: ToolRendererProps) {
  return <AgentCommandActivity activity={activityFromPart(part)} />;
}

function FileChangeToolRenderer({ part, onOpenFile }: ToolRendererProps) {
  return <AgentFileChangeActivity activity={activityFromPart(part)} onOpenFile={onOpenFile} />;
}

function GenericToolRenderer({ part }: ToolRendererProps) {
  return <AgentGenericActivity activity={activityFromPart(part)} />;
}

function FileQueryToolRenderer({ part, onOpenFile }: ToolRendererProps) {
  return <AgentFileQueryActivity activity={activityFromPart(part)} onOpenFile={onOpenFile} />;
}

function activityFromPart(part: AgentToolPart) {
  return {
    id: part.id,
    turnId: part.turnId,
    itemId: part.itemId,
    kind: part.kind,
    label: part.label,
    status: part.status,
    detail: part.detail,
    output: part.output,
    sequence: part.sequence,
  };
}

registerAgentToolRenderer("tool", GenericToolRenderer);
registerAgentToolRenderer("command", CommandToolRenderer);
registerAgentToolRenderer("bash", CommandToolRenderer);
registerAgentToolRenderer("shell", CommandToolRenderer);
registerAgentToolRenderer("file-change", FileChangeToolRenderer);
for (const tool of ["write", "edit", "apply_patch", "patch"]) registerAgentToolRenderer(tool, FileChangeToolRenderer);
for (const tool of ["read", "glob", "grep", "search", "list"]) registerAgentToolRenderer(tool, FileQueryToolRenderer);
for (const tool of ["webfetch", "websearch"]) registerAgentToolRenderer(tool, GenericToolRenderer);
