import type { CSSProperties } from "react";
import type { AnchoredOverlayPosition } from "../../app-shell/useAnchoredOverlayPosition";

type AgentRuntimeGeometryVariables = CSSProperties & Record<`--agent-${string}`, string | number>;

/**
 * Typed bridge for values that only exist at runtime. Visual declarations stay
 * in CSS; this module may expose numbers solely through Agent-owned custom properties.
 */
export function agentTranscriptFadeGeometry(opacity: number): AgentRuntimeGeometryVariables {
  return variables({ "--agent-edge-fade-top": clamp(opacity, 0, 1).toFixed(3) });
}

export function agentVirtualCanvasGeometry(height: number): AgentRuntimeGeometryVariables {
  return variables({ "--agent-virtual-canvas-height": pixels(height) });
}

export function agentVirtualRowGeometry(offset: number): AgentRuntimeGeometryVariables {
  return variables({ "--agent-virtual-row-offset": pixels(offset) });
}

export function agentPickerOverlayGeometry(position: AnchoredOverlayPosition | null): AgentRuntimeGeometryVariables | undefined {
  if (!position) return undefined;
  return variables({
    "--agent-overlay-left": pixels(position.left),
    "--agent-overlay-top": pixels(position.top),
    "--agent-overlay-width": pixels(position.width),
    "--agent-overlay-max-height": pixels(position.maxHeight),
  });
}

function variables<T extends Record<`--agent-${string}`, string | number>>(value: T) {
  return value as AgentRuntimeGeometryVariables;
}

function pixels(value: number) {
  return `${Math.max(0, Number.isFinite(value) ? value : 0)}px`;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}
