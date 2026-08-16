import {
  useCallback,
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
import {
  acquireNativeSurfacePointerPassthroughLease,
  createNativeSurfacePointerSessionId,
  type NativeSurfacePointerPassthroughLease,
} from "../../native-surfaces";
import {
  useInteractionTermination,
  type InteractionTerminationReason,
} from "../interactions/useInteractionTermination";
import {
  closestPaneDropEdge,
  paneSplitDefinition,
  type PaneDropIntent,
} from "./paneDropGeometry";
import {
  applyPaneMovePreviewSnapshot,
  capturePaneMovePreview,
  createPaneMovePreview,
  destroyPaneMovePreview,
  movePaneMovePreview,
  type PaneMovePreviewSnapshot,
} from "./paneMovePreview";

export type EditorPaneMoveHandler = (
  sourcePaneId: string,
  targetPaneId: string,
  direction: EditorSplitDirection,
  placement: NonNullable<EditorPaneSplitOptions["placement"]>,
) => void;

export type PaneMoveDragController = Readonly<{
  dragging: boolean;
  dropIntent: PaneDropIntent | null;
  prepare: (sourcePane: HTMLElement, paneId: string) => void;
  start: (event: PointerEvent<HTMLButtonElement>, pane: EditorPaneLayoutLeaf) => void;
  move: (event: PointerEvent<HTMLButtonElement>) => void;
  end: (event: PointerEvent<HTMLButtonElement>) => PaneMoveGestureResult;
  cancel: (event: PointerEvent<HTMLButtonElement>) => void;
  lostCapture: (event: PointerEvent<HTMLButtonElement>) => void;
}>;

export type PaneMoveGestureResult = "press" | "drag" | "ignored";

type PaneMoveSession = {
  handle: HTMLButtonElement;
  sourcePane: HTMLElement | null;
  sourcePaneId: string;
  originX: number;
  originY: number;
  pointerId: number;
  dragging: boolean;
  id: string;
  nativeLease: NativeSurfacePointerPassthroughLease | null;
  onMovePane: EditorPaneMoveHandler;
  preview: HTMLElement | null;
  preparedSnapshot: PreparedPaneMoveSnapshot | null;
};

type PreparedPaneMoveSnapshot = {
  paneId: string;
  sourcePane: HTMLElement;
  startedAt: number;
  promise: Promise<PaneMovePreviewSnapshot | null>;
  snapshot: PaneMovePreviewSnapshot | null;
};

type PaneMoveFinishReason = InteractionTerminationReason
  | "lostpointercapture"
  | "pointercancel"
  | "pointerup"
  | "restart";

const PANE_MOVE_THRESHOLD_PX = 3;
const PREPARED_SNAPSHOT_MAX_AGE_MS = 1_000;

export function usePaneMoveDrag(onMovePane: EditorPaneMoveHandler): PaneMoveDragController {
  const [dragging, setDragging] = useState(false);
  const [dropIntent, setDropIntent] = useState<PaneDropIntent | null>(null);
  const sessionRef = useRef<PaneMoveSession | null>(null);
  const dropIntentRef = useRef<PaneDropIntent | null>(null);
  const preparedSnapshotRef = useRef<PreparedPaneMoveSnapshot | null>(null);

  const publishDropIntent = useCallback((intent: PaneDropIntent | null) => {
    if (samePaneDropIntent(dropIntentRef.current, intent)) return;
    dropIntentRef.current = intent;
    setDropIntent(intent);
  }, []);

  const prepare = useCallback((sourcePane: HTMLElement, paneId: string) => {
    const current = preparedSnapshotRef.current;
    if (
      current
      && current.paneId === paneId
      && current.sourcePane === sourcePane
      && performance.now() - current.startedAt < PREPARED_SNAPSHOT_MAX_AGE_MS
    ) return current;

    const prepared: PreparedPaneMoveSnapshot = {
      paneId,
      sourcePane,
      startedAt: performance.now(),
      promise: capturePaneMovePreview(sourcePane),
      snapshot: null,
    };
    preparedSnapshotRef.current = prepared;
    void prepared.promise.then((snapshot) => {
      prepared.snapshot = snapshot;
    });
    return prepared;
  }, []);

  const finishGesture = useCallback((
    reason: PaneMoveFinishReason,
    expectedSessionId?: string,
  ): boolean => {
    const session = sessionRef.current;
    if (!session || (expectedSessionId && session.id !== expectedSessionId)) return false;
    sessionRef.current = null;
    if (reason !== "unmount") {
      setDragging(false);
      publishDropIntent(null);
    } else {
      dropIntentRef.current = null;
    }
    document.body.classList.remove("desktop-editor-pane-dragging");
    session.sourcePane?.removeAttribute("data-move-source");
    destroyPaneMovePreview(session.preview);
    session.nativeLease?.release();
    try {
      if (session.handle.hasPointerCapture(session.pointerId)) {
        session.handle.releasePointerCapture(session.pointerId);
      }
    } catch {
      // Pointer capture may already have been released by the browser.
    }
    return true;
  }, [publishDropIntent]);

  const finishFromLifecycle = useCallback((reason: InteractionTerminationReason): boolean => {
    return finishGesture(reason);
  }, [finishGesture]);

  useInteractionTermination({ finish: finishFromLifecycle });

  const start = useCallback((
    event: PointerEvent<HTMLButtonElement>,
    pane: EditorPaneLayoutLeaf,
  ) => {
    if (sessionRef.current) finishGesture("restart");
    const id = createNativeSurfacePointerSessionId("editor-pane-move");
    const sourcePane = event.currentTarget.closest<HTMLElement>("[data-editor-pane-id]");
    const preparedSnapshot = sourcePane ? prepare(sourcePane, pane.id) : null;
    sessionRef.current = {
      handle: event.currentTarget,
      id,
      sourcePane,
      sourcePaneId: pane.id,
      originX: event.clientX,
      originY: event.clientY,
      pointerId: event.pointerId,
      dragging: false,
      nativeLease: null,
      onMovePane,
      preview: null,
      preparedSnapshot,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      finishGesture("pointercancel", id);
    }
  }, [finishGesture, onMovePane, prepare]);

  const move = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const distance = Math.hypot(
      event.clientX - session.originX,
      event.clientY - session.originY,
    );
    if (!session.dragging) {
      if (distance < PANE_MOVE_THRESHOLD_PX) return;
      session.dragging = true;
      setDragging(true);
      document.body.classList.add("desktop-editor-pane-dragging");
      if (session.sourcePane) {
        session.preview = createPaneMovePreview(
          session.sourcePane,
          event.clientX,
          event.clientY,
          session.preparedSnapshot?.snapshot,
        );
        if (session.preparedSnapshot?.snapshot) {
          session.sourcePane.setAttribute("data-move-source", "true");
        } else if (session.preparedSnapshot) {
          const activeSessionId = session.id;
          void session.preparedSnapshot.promise.then((snapshot) => {
            const active = sessionRef.current;
            if (!active || active.id !== activeSessionId) return;
            if (snapshot && active.preview) {
              applyPaneMovePreviewSnapshot(active.preview, snapshot);
            }
            active.sourcePane?.setAttribute("data-move-source", "true");
          });
        }
      }
      session.nativeLease = acquireNativeSurfacePointerPassthroughLease(
        "editor-pane-move",
        session.id,
      );
    } else if (session.preview) {
      movePaneMovePreview(session.preview, event.clientX, event.clientY);
    }
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

  const end = useCallback((event: PointerEvent<HTMLButtonElement>): PaneMoveGestureResult => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return "ignored";
    const intent = dropIntentRef.current;
    const dragged = session.dragging;
    const shouldMove = session.dragging && Boolean(intent);
    finishGesture("pointerup", session.id);
    if (shouldMove && intent) {
      const { direction, placement } = paneSplitDefinition(intent.edge);
      session.onMovePane(session.sourcePaneId, intent.targetPaneId, direction, placement);
    }
    return dragged ? "drag" : "press";
  }, [finishGesture]);

  const cancel = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    finishGesture("pointercancel", session.id);
  }, [finishGesture]);

  const lostCapture = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    finishGesture("lostpointercapture", session.id);
  }, [finishGesture]);

  return useMemo(() => ({
    dragging,
    dropIntent,
    prepare,
    start,
    move,
    end,
    cancel,
    lostCapture,
  }), [cancel, dragging, dropIntent, end, lostCapture, move, prepare, start]);
}

function samePaneDropIntent(left: PaneDropIntent | null, right: PaneDropIntent | null): boolean {
  return left === right || Boolean(
    left
    && right
    && left.targetPaneId === right.targetPaneId
    && left.edge === right.edge,
  );
}
