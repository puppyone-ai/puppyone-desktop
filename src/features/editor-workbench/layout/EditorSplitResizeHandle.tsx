import {
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { useLocalization } from "@puppyone/localization";
import type { EditorSplitDirection } from "@puppyone/shared-ui";
import { setNativeSurfacePointerPassthrough } from "../../native-surfaces";

export type EditorSplitResizeHandleProps = Readonly<{
  direction: EditorSplitDirection;
  ratio: number;
  splitId: string;
  onResize: (splitId: string, ratio: number) => void;
}>;

export function EditorSplitResizeHandle({
  direction,
  ratio,
  splitId,
  onResize,
}: EditorSplitResizeHandleProps) {
  const { t } = useLocalization();
  const resizingRef = useRef(false);

  const finishResize = useCallback(() => {
    if (!resizingRef.current) return;
    resizingRef.current = false;
    setNativeSurfacePointerPassthrough(false);
  }, []);

  useEffect(() => finishResize, [finishResize]);

  const updateFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const container = event.currentTarget.parentElement;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const dividerRect = event.currentTarget.getBoundingClientRect();
    const total = direction === "horizontal" ? containerRect.width : containerRect.height;
    const dividerSize = direction === "horizontal" ? dividerRect.width : dividerRect.height;
    const offset = direction === "horizontal"
      ? event.clientX - containerRect.left
      : event.clientY - containerRect.top;
    const usable = Math.max(1, total - dividerSize);
    onResize(splitId, (offset - dividerSize / 2) / usable);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const decrementKey = direction === "horizontal" ? "ArrowLeft" : "ArrowUp";
    const incrementKey = direction === "horizontal" ? "ArrowRight" : "ArrowDown";
    if (event.key !== decrementKey && event.key !== incrementKey) return;
    event.preventDefault();
    onResize(splitId, ratio + (event.key === decrementKey ? -0.025 : 0.025));
  };

  return (
    <div
      className="desktop-editor-splitter"
      data-direction={direction}
      role="separator"
      tabIndex={0}
      aria-label={t("editor.panes.resize")}
      aria-orientation={direction === "horizontal" ? "vertical" : "horizontal"}
      aria-valuemin={15}
      aria-valuemax={85}
      aria-valuenow={Math.round(ratio * 100)}
      onKeyDown={handleKeyDown}
      onDoubleClick={() => onResize(splitId, 0.5)}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        if (!resizingRef.current) {
          resizingRef.current = true;
          setNativeSurfacePointerPassthrough(true);
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.dataset.resizing = "true";
        updateFromPointer(event);
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        updateFromPointer(event);
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        delete event.currentTarget.dataset.resizing;
        finishResize();
      }}
      onPointerCancel={(event) => {
        delete event.currentTarget.dataset.resizing;
        finishResize();
      }}
      onLostPointerCapture={finishResize}
    />
  );
}
