import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";

export type PaneResizeDragPoint = {
  clientX: number;
  clientY: number;
};

export type PaneResizeDragSession = {
  onMove: (point: PaneResizeDragPoint) => void;
  onEnd?: () => void;
};

export type UsePaneResizeDragOptions = {
  enabled?: boolean;
  bodyClassName: string;
  onDragStart: (event: ReactPointerEvent<HTMLElement>) => PaneResizeDragSession | null | undefined;
};

export function usePaneResizeDrag({
  enabled = true,
  bodyClassName,
  onDragStart,
}: UsePaneResizeDragOptions) {
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => {
    cleanupRef.current?.();
    cleanupRef.current = null;
  }, []);

  return useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!enabled || event.button !== 0) return;

    cleanupRef.current?.();
    cleanupRef.current = null;

    const session = onDragStart(event);
    if (!session) return;

    event.preventDefault();
    event.stopPropagation();

    const pointerId = event.pointerId;
    const handle = event.currentTarget;
    let active = true;
    let frameId: number | null = null;
    let latestPoint: PaneResizeDragPoint | null = null;

    const flushMove = () => {
      if (!latestPoint) return;
      const point = latestPoint;
      latestPoint = null;
      session.onMove(point);
    };

    const cancelScheduledMove = () => {
      if (frameId === null) return;
      window.cancelAnimationFrame(frameId);
      frameId = null;
    };

    const scheduleMove = (pointerEvent: PointerEvent) => {
      latestPoint = {
        clientX: pointerEvent.clientX,
        clientY: pointerEvent.clientY,
      };
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        flushMove();
      });
    };

    const stop = () => {
      if (!active) return;
      active = false;
      cancelScheduledMove();
      flushMove();

      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointerup", handlePointerEnd, true);
      window.removeEventListener("pointercancel", handlePointerEnd, true);
      window.removeEventListener("blur", stop, true);
      document.removeEventListener("visibilitychange", handleVisibilityChange, true);
      handle.removeEventListener("lostpointercapture", stop);
      document.body.classList.remove(bodyClassName);

      try {
        if (handle.hasPointerCapture?.(pointerId)) {
          handle.releasePointerCapture(pointerId);
        }
      } catch {
        // Pointer capture may already be released by the browser.
      }

      session.onEnd?.();
      if (cleanupRef.current === stop) cleanupRef.current = null;
    };

    const handlePointerMove = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) return;
      pointerEvent.preventDefault();
      scheduleMove(pointerEvent);
    };

    const handlePointerEnd = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) return;
      pointerEvent.preventDefault();
      scheduleMove(pointerEvent);
      stop();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") stop();
    };

    document.body.classList.add(bodyClassName);

    try {
      handle.setPointerCapture?.(pointerId);
    } catch {
      // Older or interrupted pointer sessions may not allow capture.
    }

    handle.addEventListener("lostpointercapture", stop);
    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("pointerup", handlePointerEnd, true);
    window.addEventListener("pointercancel", handlePointerEnd, true);
    window.addEventListener("blur", stop, true);
    document.addEventListener("visibilitychange", handleVisibilityChange, true);

    cleanupRef.current = stop;
  }, [bodyClassName, enabled, onDragStart]);
}
