import type { TimelineRow } from "../domain/agent-projection-types";
import type { AgentTimelineLayout } from "./agent-timeline-layout";

export type AgentTimelineScrollAnchor =
  | { kind: "row"; rowId: string; offset: number }
  | { kind: "absolute"; scrollTop: number };

/**
 * Captures one stable viewport coordinate before a width-driven reflow.
 * Native scroll anchoring is disabled because the transcript is virtualized,
 * so the virtual layout must own the anchor explicitly.
 */
export function captureAgentTimelineScrollAnchor(
  rows: readonly TimelineRow[],
  layout: AgentTimelineLayout,
  scrollTop: number,
  timelineTop: number,
): AgentTimelineScrollAnchor {
  const localScrollTop = scrollTop - timelineTop;
  if (rows.length === 0 || localScrollTop < 0) {
    return { kind: "absolute", scrollTop };
  }

  const index = Math.min(
    rows.length - 1,
    Math.max(0, upperBound(layout.offsets, localScrollTop) - 1),
  );
  return {
    kind: "row",
    rowId: rows[index].id,
    offset: localScrollTop - layout.offsets[index],
  };
}

export function resolveAgentTimelineScrollAnchor(
  anchor: AgentTimelineScrollAnchor,
  layout: AgentTimelineLayout,
  rowIndexById: ReadonlyMap<string, number>,
  timelineTop: number,
) {
  if (anchor.kind === "absolute") return anchor.scrollTop;
  const index = rowIndexById.get(anchor.rowId);
  if (index === undefined) return null;
  return Math.max(0, timelineTop + layout.offsets[index] + anchor.offset);
}

function upperBound(values: readonly number[], target: number) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (values[middle] <= target) low = middle + 1;
    else high = middle;
  }
  return low;
}
