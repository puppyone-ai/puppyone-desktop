import type {
  EditorPaneSplitOptions,
  EditorSplitDirection,
} from "@puppyone/shared-ui";

export type PaneDropEdge = "left" | "right" | "top" | "bottom";

export type PaneDropIntent = Readonly<{
  targetPaneId: string;
  edge: PaneDropEdge;
}>;

export function closestPaneDropEdge(rect: DOMRect, x: number, y: number): PaneDropEdge {
  const distances: ReadonlyArray<readonly [PaneDropEdge, number]> = [
    ["left", Math.abs(x - rect.left) / Math.max(1, rect.width)],
    ["right", Math.abs(rect.right - x) / Math.max(1, rect.width)],
    ["top", Math.abs(y - rect.top) / Math.max(1, rect.height)],
    ["bottom", Math.abs(rect.bottom - y) / Math.max(1, rect.height)],
  ];
  return distances.reduce((closest, candidate) => (
    candidate[1] < closest[1] ? candidate : closest
  ))[0];
}

export function paneSplitDefinition(edge: PaneDropEdge): {
  direction: EditorSplitDirection;
  placement: NonNullable<EditorPaneSplitOptions["placement"]>;
} {
  if (edge === "left") return { direction: "horizontal", placement: "first" };
  if (edge === "right") return { direction: "horizontal", placement: "second" };
  if (edge === "top") return { direction: "vertical", placement: "first" };
  return { direction: "vertical", placement: "second" };
}
