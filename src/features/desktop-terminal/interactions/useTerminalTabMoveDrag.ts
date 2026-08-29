import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import {
  closestWorkbenchSplitDropEdge,
  type WorkbenchSplitDropEdge,
} from "@puppyone/shared-ui";
import {
  acquireNativeSurfacePointerPassthroughLease,
  createNativeSurfacePointerSessionId,
  type NativeSurfacePointerPassthroughLease,
} from "../../native-surfaces";
import {
  useInteractionTermination,
  type InteractionTerminationReason,
} from "../../workbench-interactions/useInteractionTermination";
import {
  sameTerminalTabMoveDropIntent,
  type TerminalTabMoveDropIntent,
} from "../model/terminalTabMove";
import {
  createTerminalTabMovePreview,
  destroyTerminalTabMovePreview,
  moveTerminalTabMovePreview,
} from "./terminalTabMovePreview";

export type TerminalTabMoveGestureResult = "press" | "drag" | "ignored";

export type TerminalTabMoveAdmission = (
  sourceSessionId: string,
  targetSessionId: string,
  edge: WorkbenchSplitDropEdge,
  targetPane: HTMLElement,
) => boolean;

export type TerminalTabMoveDragController = Readonly<{
  dragging: boolean;
  dropIntent: TerminalTabMoveDropIntent | null;
  start: (
    event: PointerEvent<HTMLButtonElement>,
    sessionId: string,
    label: string,
  ) => void;
  move: (event: PointerEvent<HTMLButtonElement>) => void;
  end: (event: PointerEvent<HTMLButtonElement>) => TerminalTabMoveGestureResult;
  cancel: (event: PointerEvent<HTMLButtonElement>) => void;
  lostCapture: (event: PointerEvent<HTMLButtonElement>) => void;
}>;

type TerminalTabMoveSession = {
  dragging: boolean;
  handle: HTMLButtonElement;
  id: string;
  label: string;
  nativeLease: NativeSurfacePointerPassthroughLease | null;
  onMoveSession: UseTerminalTabMoveDragOptions["onMoveSession"];
  originX: number;
  originY: number;
  pointerId: number;
  preview: HTMLElement | null;
  sourceElement: HTMLElement | null;
  sourceSessionId: string;
};

type FinishReason = InteractionTerminationReason
  | "lostpointercapture"
  | "pointercancel"
  | "pointerup"
  | "restart";

type UseTerminalTabMoveDragOptions = Readonly<{
  canDrop: TerminalTabMoveAdmission;
  onMoveSession: (
    sourceSessionId: string,
    targetSessionId: string,
    edge: WorkbenchSplitDropEdge,
  ) => void;
}>;

const TERMINAL_TAB_MOVE_THRESHOLD_PX = 3;

export function useTerminalTabMoveDrag({
  canDrop,
  onMoveSession,
}: UseTerminalTabMoveDragOptions): TerminalTabMoveDragController {
  const [dragging, setDragging] = useState(false);
  const [dropIntent, setDropIntent] = useState<TerminalTabMoveDropIntent | null>(null);
  const sessionRef = useRef<TerminalTabMoveSession | null>(null);
  const dropIntentRef = useRef<TerminalTabMoveDropIntent | null>(null);
  const canDropRef = useRef(canDrop);
  canDropRef.current = canDrop;

  const publishDropIntent = useCallback((intent: TerminalTabMoveDropIntent | null) => {
    if (sameTerminalTabMoveDropIntent(dropIntentRef.current, intent)) return;
    dropIntentRef.current = intent;
    setDropIntent(intent);
  }, []);

  const finish = useCallback((reason: FinishReason, expectedSessionId?: string) => {
    const session = sessionRef.current;
    if (!session || (expectedSessionId && session.id !== expectedSessionId)) return false;
    sessionRef.current = null;
    if (reason !== "unmount") {
      setDragging(false);
      publishDropIntent(null);
    } else {
      dropIntentRef.current = null;
    }
    document.body.classList.remove("desktop-terminal-tab-dragging");
    session.sourceElement?.removeAttribute("data-move-source");
    destroyTerminalTabMovePreview(session.preview);
    session.nativeLease?.release();
    try {
      if (session.handle.hasPointerCapture(session.pointerId)) {
        session.handle.releasePointerCapture(session.pointerId);
      }
    } catch {
      // Pointer capture may already be gone during cancellation.
    }
    return true;
  }, [publishDropIntent]);

  const finishFromLifecycle = useCallback((reason: InteractionTerminationReason) => (
    finish(reason)
  ), [finish]);
  useInteractionTermination({ finish: finishFromLifecycle });

  const start = useCallback((
    event: PointerEvent<HTMLButtonElement>,
    sessionId: string,
    label: string,
  ) => {
    if (event.button !== 0) return;
    if (sessionRef.current) finish("restart");
    const id = createNativeSurfacePointerSessionId("terminal-tab-move");
    sessionRef.current = {
      dragging: false,
      handle: event.currentTarget,
      id,
      label,
      nativeLease: null,
      onMoveSession,
      originX: event.clientX,
      originY: event.clientY,
      pointerId: event.pointerId,
      preview: null,
      sourceElement: event.currentTarget.closest<HTMLElement>(".desktop-terminal-tab"),
      sourceSessionId: sessionId,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      finish("pointercancel", id);
    }
  }, [finish, onMoveSession]);

  const move = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const distance = Math.hypot(
      event.clientX - session.originX,
      event.clientY - session.originY,
    );
    if (!session.dragging) {
      if (distance < TERMINAL_TAB_MOVE_THRESHOLD_PX) return;
      event.preventDefault();
      session.dragging = true;
      setDragging(true);
      document.body.classList.add("desktop-terminal-tab-dragging");
      session.sourceElement?.setAttribute("data-move-source", "true");
      session.preview = createTerminalTabMovePreview(
        session.handle,
        session.label,
        event.clientX,
        event.clientY,
      );
      session.nativeLease = acquireNativeSurfacePointerPassthroughLease(
        "terminal-tab-move",
        session.id,
      );
    } else if (session.preview) {
      event.preventDefault();
      moveTerminalTabMovePreview(session.preview, event.clientX, event.clientY);
    }

    const element = document.elementFromPoint?.(event.clientX, event.clientY);
    const target = element?.closest<HTMLElement>("[data-terminal-session-pane-id]");
    const targetSessionId = target?.dataset.terminalSessionPaneId;
    if (!target || !targetSessionId || targetSessionId === session.sourceSessionId) {
      publishDropIntent(null);
      return;
    }
    const edge = closestWorkbenchSplitDropEdge(
      target.getBoundingClientRect(),
      event.clientX,
      event.clientY,
    );
    publishDropIntent({
      targetSessionId,
      edge,
      allowed: canDropRef.current(
        session.sourceSessionId,
        targetSessionId,
        edge,
        target,
      ),
    });
  }, [publishDropIntent]);

  const end = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return "ignored";
    const intent = dropIntentRef.current;
    const dragged = session.dragging;
    const shouldMove = dragged && Boolean(intent?.allowed);
    finish("pointerup", session.id);
    if (shouldMove && intent) {
      session.onMoveSession(session.sourceSessionId, intent.targetSessionId, intent.edge);
    }
    return dragged ? "drag" : "press";
  }, [finish]);

  const cancel = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    finish("pointercancel", session.id);
  }, [finish]);

  const lostCapture = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    finish("lostpointercapture", session.id);
  }, [finish]);

  return useMemo(() => ({
    dragging,
    dropIntent,
    start,
    move,
    end,
    cancel,
    lostCapture,
  }), [cancel, dragging, dropIntent, end, lostCapture, move, start]);
}
