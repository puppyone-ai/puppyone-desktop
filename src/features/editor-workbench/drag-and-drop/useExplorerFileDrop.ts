import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import {
  EXPLORER_REFERENCE_DRAG_TYPE,
  parseExplorerReferenceDrag,
  type EditorPaneSplitOptions,
  type EditorSplitDirection,
} from "@puppyone/shared-ui";
import { setNativeSurfacePointerPassthrough } from "../../native-surfaces";
import {
  closestPaneDropEdge,
  paneSplitDefinition,
  type PaneDropIntent,
} from "./paneDropGeometry";

export type EditorFileDropHandler = (
  path: string,
  label: string,
  targetPaneId: string,
  direction: EditorSplitDirection,
  placement: NonNullable<EditorPaneSplitOptions["placement"]>,
) => void;

export type EditorFileDropController = Readonly<{
  dropIntent: PaneDropIntent | null;
  over: (event: DragEvent<HTMLElement>, paneId: string) => void;
  leave: (event: DragEvent<HTMLElement>, paneId: string) => void;
  drop: (event: DragEvent<HTMLElement>, paneId: string) => void;
}>;

export function useExplorerFileDrop(
  workspaceId: string,
  onOpenAtPaneEdge: EditorFileDropHandler,
): EditorFileDropController {
  const [dropIntent, setDropIntent] = useState<PaneDropIntent | null>(null);
  const nativePassthroughRef = useRef(false);

  const beginNativePassthrough = useCallback(() => {
    if (nativePassthroughRef.current) return;
    nativePassthroughRef.current = true;
    setNativeSurfacePointerPassthrough(true);
  }, []);
  const finishFileDrag = useCallback(() => {
    setDropIntent(null);
    if (!nativePassthroughRef.current) return;
    nativePassthroughRef.current = false;
    setNativeSurfacePointerPassthrough(false);
  }, []);

  useEffect(() => {
    const start = (event: globalThis.DragEvent) => {
      if (hasExplorerFileDrag(event.dataTransfer)) beginNativePassthrough();
    };
    const cancelOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") finishFileDrag();
    };
    window.addEventListener("dragstart", start);
    window.addEventListener("dragend", finishFileDrag);
    window.addEventListener("drop", finishFileDrag);
    window.addEventListener("keydown", cancelOnEscape, true);
    return () => {
      window.removeEventListener("dragstart", start);
      window.removeEventListener("dragend", finishFileDrag);
      window.removeEventListener("drop", finishFileDrag);
      window.removeEventListener("keydown", cancelOnEscape, true);
      finishFileDrag();
    };
  }, [beginNativePassthrough, finishFileDrag]);

  const over = useCallback((event: DragEvent<HTMLElement>, paneId: string) => {
    if (!hasExplorerFileDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    beginNativePassthrough();
    setDropIntent({
      targetPaneId: paneId,
      edge: closestPaneDropEdge(
        event.currentTarget.getBoundingClientRect(),
        event.clientX,
        event.clientY,
      ),
    });
  }, [beginNativePassthrough]);

  const leave = useCallback((event: DragEvent<HTMLElement>, paneId: string) => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    setDropIntent((current) => current?.targetPaneId === paneId ? null : current);
  }, []);

  const drop = useCallback((event: DragEvent<HTMLElement>, paneId: string) => {
    if (!hasExplorerFileDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    const payload = parseExplorerReferenceDrag(
      event.dataTransfer.getData(EXPLORER_REFERENCE_DRAG_TYPE),
    );
    const entry = payload?.workspaceId === workspaceId && payload.entries.length === 1
      ? payload.entries[0]
      : null;
    const edge = closestPaneDropEdge(
      event.currentTarget.getBoundingClientRect(),
      event.clientX,
      event.clientY,
    );
    finishFileDrag();
    if (!entry || entry.entryType !== "file") return;
    const { direction, placement } = paneSplitDefinition(edge);
    onOpenAtPaneEdge(entry.path, entry.name, paneId, direction, placement);
  }, [finishFileDrag, onOpenAtPaneEdge, workspaceId]);

  return useMemo(() => ({ dropIntent, over, leave, drop }), [drop, dropIntent, leave, over]);
}

function hasExplorerFileDrag(dataTransfer: DataTransfer | null): boolean {
  return Boolean(
    dataTransfer
    && Array.from(dataTransfer.types ?? []).includes(EXPLORER_REFERENCE_DRAG_TYPE),
  );
}
