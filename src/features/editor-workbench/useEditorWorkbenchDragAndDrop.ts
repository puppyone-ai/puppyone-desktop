import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent,
} from "react";
import {
  EXPLORER_REFERENCE_DRAG_TYPE,
  parseExplorerReferenceDrag,
  type EditorPaneLayoutLeaf,
  type EditorPaneSplitOptions,
  type EditorSplitDirection,
} from "@puppyone/shared-ui";
import { setNativeSurfacePointerPassthrough } from "../native-surfaces";

export type EditorPaneMoveHandler = (
  sourcePaneId: string,
  targetPaneId: string,
  direction: EditorSplitDirection,
  placement: NonNullable<EditorPaneSplitOptions["placement"]>,
) => void;

export type EditorFileDropHandler = (
  path: string,
  label: string,
  targetPaneId: string,
  direction: EditorSplitDirection,
  placement: NonNullable<EditorPaneSplitOptions["placement"]>,
) => void;

type SplitDropEdge = "left" | "right" | "top" | "bottom";

type SplitDropIntent = Readonly<{
  targetPaneId: string;
  edge: SplitDropEdge;
}>;

export type PaneMoveDragController = Readonly<{
  dropIntent: SplitDropIntent | null;
  start: (event: PointerEvent<HTMLButtonElement>, pane: EditorPaneLayoutLeaf) => void;
  move: (event: PointerEvent<HTMLButtonElement>) => void;
  end: (event: PointerEvent<HTMLButtonElement>) => void;
  cancel: (event: PointerEvent<HTMLButtonElement>) => void;
  consumeDraggedClick: () => boolean;
}>;

export type EditorFileDropController = Readonly<{
  dropIntent: SplitDropIntent | null;
  over: (event: DragEvent<HTMLElement>, paneId: string) => void;
  leave: (event: DragEvent<HTMLElement>, paneId: string) => void;
  drop: (event: DragEvent<HTMLElement>, paneId: string) => void;
}>;

type PaneMoveSession = {
  handle: HTMLButtonElement;
  sourcePaneId: string;
  originX: number;
  originY: number;
  pointerId: number;
  dragging: boolean;
};

const PANE_MOVE_THRESHOLD_PX = 5;

export function usePaneMoveDrag(onMovePane: EditorPaneMoveHandler): PaneMoveDragController {
  const [dropIntent, setDropIntent] = useState<SplitDropIntent | null>(null);
  const sessionRef = useRef<PaneMoveSession | null>(null);
  const dropIntentRef = useRef<SplitDropIntent | null>(null);
  const draggedClickRef = useRef(false);

  const publishDropIntent = useCallback((intent: SplitDropIntent | null) => {
    dropIntentRef.current = intent;
    setDropIntent(intent);
  }, []);

  const finishGesture = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    if (session.handle.hasPointerCapture(session.pointerId)) {
      session.handle.releasePointerCapture(session.pointerId);
    }
    sessionRef.current = null;
    publishDropIntent(null);
    document.body.classList.remove("desktop-editor-pane-dragging");
    setNativeSurfacePointerPassthrough(false);
  }, [publishDropIntent]);

  useEffect(() => {
    const cancelOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || !sessionRef.current) return;
      draggedClickRef.current = sessionRef.current.dragging;
      finishGesture();
    };
    window.addEventListener("keydown", cancelOnEscape, true);
    return () => {
      window.removeEventListener("keydown", cancelOnEscape, true);
      finishGesture();
    };
  }, [finishGesture]);

  const start = useCallback((
    event: PointerEvent<HTMLButtonElement>,
    pane: EditorPaneLayoutLeaf,
  ) => {
    if (sessionRef.current) finishGesture();
    draggedClickRef.current = false;
    sessionRef.current = {
      handle: event.currentTarget,
      sourcePaneId: pane.id,
      originX: event.clientX,
      originY: event.clientY,
      pointerId: event.pointerId,
      dragging: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.classList.add("desktop-editor-pane-dragging");
    setNativeSurfacePointerPassthrough(true);
  }, [finishGesture]);

  const move = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const distance = Math.hypot(
      event.clientX - session.originX,
      event.clientY - session.originY,
    );
    if (!session.dragging && distance < PANE_MOVE_THRESHOLD_PX) return;
    session.dragging = true;
    draggedClickRef.current = true;
    const element = document.elementFromPoint?.(event.clientX, event.clientY);
    const target = element?.closest<HTMLElement>("[data-editor-pane-id]");
    if (!target || target.dataset.editorPaneId === session.sourcePaneId) {
      publishDropIntent(null);
      return;
    }
    publishDropIntent({
      targetPaneId: target.dataset.editorPaneId!,
      edge: closestSplitEdge(target.getBoundingClientRect(), event.clientX, event.clientY),
    });
  }, [publishDropIntent]);

  const end = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const intent = dropIntentRef.current;
    if (session.dragging && intent) {
      const { direction, placement } = splitDefinitionForEdge(intent.edge);
      onMovePane(session.sourcePaneId, intent.targetPaneId, direction, placement);
    }
    finishGesture();
  }, [finishGesture, onMovePane]);

  const cancel = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    draggedClickRef.current = session.dragging;
    finishGesture();
  }, [finishGesture]);

  const consumeDraggedClick = useCallback(() => {
    const dragged = draggedClickRef.current;
    draggedClickRef.current = false;
    return dragged;
  }, []);

  return useMemo(() => ({
    dropIntent,
    start,
    move,
    end,
    cancel,
    consumeDraggedClick,
  }), [cancel, consumeDraggedClick, dropIntent, end, move, start]);
}

export function useEditorFileDrop(
  workspaceId: string,
  onOpenAtPaneEdge: EditorFileDropHandler,
): EditorFileDropController {
  const [dropIntent, setDropIntent] = useState<SplitDropIntent | null>(null);
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
      edge: closestSplitEdge(
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
    const edge = closestSplitEdge(
      event.currentTarget.getBoundingClientRect(),
      event.clientX,
      event.clientY,
    );
    finishFileDrag();
    if (!entry || entry.entryType !== "file") return;
    const { direction, placement } = splitDefinitionForEdge(edge);
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

function closestSplitEdge(rect: DOMRect, x: number, y: number): SplitDropEdge {
  const distances: ReadonlyArray<readonly [SplitDropEdge, number]> = [
    ["left", Math.abs(x - rect.left) / Math.max(1, rect.width)],
    ["right", Math.abs(rect.right - x) / Math.max(1, rect.width)],
    ["top", Math.abs(y - rect.top) / Math.max(1, rect.height)],
    ["bottom", Math.abs(rect.bottom - y) / Math.max(1, rect.height)],
  ];
  return distances.reduce((closest, candidate) => (
    candidate[1] < closest[1] ? candidate : closest
  ))[0];
}

function splitDefinitionForEdge(edge: SplitDropEdge): {
  direction: EditorSplitDirection;
  placement: NonNullable<EditorPaneSplitOptions["placement"]>;
} {
  if (edge === "left") return { direction: "horizontal", placement: "first" };
  if (edge === "right") return { direction: "horizontal", placement: "second" };
  if (edge === "top") return { direction: "vertical", placement: "first" };
  return { direction: "vertical", placement: "second" };
}
