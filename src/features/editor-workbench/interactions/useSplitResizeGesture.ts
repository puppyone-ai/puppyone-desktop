import { useCallback, useEffect, useRef, type PointerEvent } from "react";
import {
  clampEditorSplitRatio,
  type EditorSplitDirection,
} from "@puppyone/shared-ui";
import { setNativeSurfacePointerPassthrough } from "../../native-surfaces";

type ResizeSession = {
  committedRatio: number;
  container: HTMLElement;
  frameId: number | null;
  handle: HTMLElement;
  pointerId: number;
  previewRatio: number;
};

export type SplitResizeGestureOptions = Readonly<{
  direction: EditorSplitDirection;
  ratio: number;
  splitId: string;
  onCommit: (splitId: string, ratio: number) => void;
}>;

/** Keeps high-frequency pointer preview outside React state. The durable split
 * tree receives exactly one ratio when the gesture completes. */
export function useSplitResizeGesture({
  direction,
  ratio,
  splitId,
  onCommit,
}: SplitResizeGestureOptions) {
  const sessionRef = useRef<ResizeSession | null>(null);

  const applyPreview = useCallback((session: ResizeSession, nextRatio: number) => {
    const value = clampEditorSplitRatio(nextRatio);
    session.previewRatio = value;
    session.container.style.setProperty("--desktop-editor-first-track", `${value}fr`);
    session.container.style.setProperty("--desktop-editor-second-track", `${1 - value}fr`);
    session.handle.setAttribute("aria-valuenow", String(Math.round(value * 100)));
  }, []);

  const flushPreview = useCallback((session: ResizeSession) => {
    if (session.frameId === null) return;
    session.handle.ownerDocument.defaultView?.cancelAnimationFrame(session.frameId);
    session.frameId = null;
    applyPreview(session, session.previewRatio);
  }, [applyPreview]);

  const finish = useCallback((mode: "commit" | "cancel") => {
    const session = sessionRef.current;
    if (!session) return;
    flushPreview(session);
    sessionRef.current = null;
    delete session.handle.dataset.resizing;
    setNativeSurfacePointerPassthrough(false);
    if (mode === "cancel") {
      applyPreview(session, session.committedRatio);
      return;
    }
    if (session.previewRatio !== session.committedRatio) {
      onCommit(splitId, session.previewRatio);
    }
  }, [applyPreview, flushPreview, onCommit, splitId]);

  useEffect(() => {
    const cancelOnEscape = (event: globalThis.KeyboardEvent) => {
      const session = sessionRef.current;
      if (event.key !== "Escape" || !session) return;
      event.preventDefault();
      event.stopPropagation();
      finish("cancel");
      if (session.handle.hasPointerCapture(session.pointerId)) {
        session.handle.releasePointerCapture(session.pointerId);
      }
    };
    window.addEventListener("keydown", cancelOnEscape, true);
    return () => {
      window.removeEventListener("keydown", cancelOnEscape, true);
      finish("cancel");
    };
  }, [finish]);

  const previewFromPointer = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const containerRect = session.container.getBoundingClientRect();
    const dividerRect = session.handle.getBoundingClientRect();
    const total = direction === "horizontal" ? containerRect.width : containerRect.height;
    const dividerSize = direction === "horizontal" ? dividerRect.width : dividerRect.height;
    const offset = direction === "horizontal"
      ? event.clientX - containerRect.left
      : event.clientY - containerRect.top;
    session.previewRatio = clampEditorSplitRatio(
      (offset - dividerSize / 2) / Math.max(1, total - dividerSize),
    );
    if (session.frameId !== null) return;
    const ownerWindow = session.handle.ownerDocument.defaultView;
    if (!ownerWindow) {
      applyPreview(session, session.previewRatio);
      return;
    }
    session.frameId = ownerWindow.requestAnimationFrame(() => {
      session.frameId = null;
      if (sessionRef.current === session) applyPreview(session, session.previewRatio);
    });
  }, [applyPreview, direction]);

  const start = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    finish("cancel");
    const container = event.currentTarget.parentElement;
    if (!container) return;
    const committedRatio = clampEditorSplitRatio(ratio);
    sessionRef.current = {
      committedRatio,
      container,
      frameId: null,
      handle: event.currentTarget,
      pointerId: event.pointerId,
      previewRatio: committedRatio,
    };
    setNativeSurfacePointerPassthrough(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.dataset.resizing = "true";
    previewFromPointer(event);
  }, [finish, previewFromPointer, ratio]);

  const move = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) previewFromPointer(event);
  }, [previewFromPointer]);

  const end = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    previewFromPointer(event);
    finish("commit");
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, [finish, previewFromPointer]);

  const cancel = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    finish("cancel");
  }, [finish]);

  const lostCapture = useCallback(() => finish("commit"), [finish]);

  return { start, move, end, cancel, lostCapture } as const;
}
