import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import type {
  EditorPaneLayoutLeaf,
  EditorPaneSplitOptions,
  EditorSplitDirection,
} from "@puppyone/shared-ui";
import { setNativeSurfacePointerPassthrough } from "../../native-surfaces";
import {
  closestPaneDropEdge,
  paneSplitDefinition,
  type PaneDropIntent,
} from "./paneDropGeometry";

export type EditorPaneMoveHandler = (
  sourcePaneId: string,
  targetPaneId: string,
  direction: EditorSplitDirection,
  placement: NonNullable<EditorPaneSplitOptions["placement"]>,
) => void;

export type PaneMoveDragController = Readonly<{
  dropIntent: PaneDropIntent | null;
  start: (event: PointerEvent<HTMLButtonElement>, pane: EditorPaneLayoutLeaf) => void;
  move: (event: PointerEvent<HTMLButtonElement>) => void;
  end: (event: PointerEvent<HTMLButtonElement>) => void;
  cancel: (event: PointerEvent<HTMLButtonElement>) => void;
  consumeDraggedClick: () => boolean;
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
  const [dropIntent, setDropIntent] = useState<PaneDropIntent | null>(null);
  const sessionRef = useRef<PaneMoveSession | null>(null);
  const dropIntentRef = useRef<PaneDropIntent | null>(null);
  const draggedClickRef = useRef(false);

  const publishDropIntent = useCallback((intent: PaneDropIntent | null) => {
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
      edge: closestPaneDropEdge(target.getBoundingClientRect(), event.clientX, event.clientY),
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
      const { direction, placement } = paneSplitDefinition(intent.edge);
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
