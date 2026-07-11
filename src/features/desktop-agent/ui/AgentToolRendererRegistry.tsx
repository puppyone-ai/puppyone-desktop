import type { ComponentType } from "react";
import type { AgentPart } from "../domain/agent-projection-types";
import { AgentActivityItem } from "./AgentActivityItem";
import { AgentCommandActivity, AgentFileChangeActivity, AgentGenericActivity } from "./activity";

type AgentActivityPart = Extract<AgentPart, { label: string }>;
export type AgentToolPart = AgentActivityPart & { kind: "tool" | "command" | "file-change" };
type ToolRendererProps = {
  part: AgentToolPart;
  onViewChanges?: () => void;
  onOpenTerminal?: () => void;
  onOpenFile?: (path: string) => void;
};

const renderers = new Map<string, ComponentType<ToolRendererProps>>();

export function registerAgentToolRenderer(tool: string, renderer: ComponentType<ToolRendererProps>) {
  renderers.set(tool, renderer);
}

export function isAgentToolPart(part: AgentPart): part is AgentToolPart {
  return part.kind === "tool" || part.kind === "command" || part.kind === "file-change";
}

export function AgentToolRenderer({ part, onViewChanges, onOpenTerminal, onOpenFile }: ToolRendererProps) {
  const tool = typeof part.detail.tool === "string" ? part.detail.tool : part.kind;
  const Renderer = renderers.get(tool) || renderers.get(part.kind) || DefaultToolRenderer;
  return <Renderer part={part} onViewChanges={onViewChanges} onOpenTerminal={onOpenTerminal} onOpenFile={onOpenFile} />;
}

function DefaultToolRenderer({ part, onViewChanges, onOpenTerminal, onOpenFile }: ToolRendererProps) {
  return <AgentActivityItem activity={activityFromPart(part)} onViewChanges={onViewChanges} onOpenTerminal={onOpenTerminal} onOpenFile={onOpenFile} />;
}

function CommandToolRenderer({ part, onOpenTerminal }: ToolRendererProps) {
  return <AgentCommandActivity activity={activityFromPart(part)} onOpenTerminal={onOpenTerminal} />;
}

function FileChangeToolRenderer({ part, onViewChanges, onOpenFile }: ToolRendererProps) {
  return <AgentFileChangeActivity activity={activityFromPart(part)} onViewChanges={onViewChanges} onOpenFile={onOpenFile} />;
}

function GenericToolRenderer({ part, onOpenFile }: ToolRendererProps) {
  return <AgentGenericActivity activity={activityFromPart(part)} onOpenFile={onOpenFile} />;
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
for (const tool of ["read", "glob", "grep", "list", "webfetch", "websearch"]) registerAgentToolRenderer(tool, GenericToolRenderer);
