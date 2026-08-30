import {
  closestWorkbenchSplitDropEdge,
  workbenchSplitDefinition,
  type EditorPaneSplitOptions,
  type EditorSplitDirection,
  type WorkbenchSplitDropEdge,
} from "@puppyone/shared-ui";

export type PaneDropEdge = WorkbenchSplitDropEdge;

export type PaneDropIntent = Readonly<{
  targetPaneId: string;
  edge: PaneDropEdge;
}>;

export const closestPaneDropEdge = closestWorkbenchSplitDropEdge;

export function paneSplitDefinition(edge: PaneDropEdge): {
  direction: EditorSplitDirection;
  placement: NonNullable<EditorPaneSplitOptions["placement"]>;
} {
  return workbenchSplitDefinition(edge);
}
