import type { ReactNode } from "react";
import type { AgentPart } from "../domain/agent-projection-types";

export type AgentPartKind = AgentPart["kind"];
export type AgentPartByKind<TKind extends AgentPartKind> = Extract<AgentPart, { kind: TKind }>;
export type AgentPartRendererProps<TKind extends AgentPartKind | null = null> = {
  part: TKind extends AgentPartKind ? AgentPartByKind<TKind> : AgentPart;
  runtimeLabel: string;
  onOpenFile?: (path: string) => void;
};

export type AgentSemanticPartRenderer<TKind extends AgentPartKind | null = null> = (
  props: AgentPartRendererProps<TKind>
) => ReactNode;

type AnyPartRenderer = AgentSemanticPartRenderer;
const renderers = new Map<AgentPartKind, AnyPartRenderer>();

/** Registers one semantic part renderer. Provider-native names never enter this registry. */
export function registerAgentPartRenderer<TKind extends AgentPartKind>(
  kind: TKind,
  renderer: AgentSemanticPartRenderer<TKind>,
) {
  const stored = renderer as unknown as AnyPartRenderer;
  const previous = renderers.get(kind);
  renderers.set(kind, stored);
  return () => {
    if (renderers.get(kind) !== stored) return;
    if (previous) renderers.set(kind, previous);
    else renderers.delete(kind);
  };
}

export function resolveAgentPartRenderer(kind: AgentPartKind) {
  return renderers.get(kind) ?? null;
}
