import {
  type KeyboardEvent,
} from "react";
import { useLocalization } from "@puppyone/localization";
import {
  EDITOR_SPLIT_RATIO_MAX,
  EDITOR_SPLIT_RATIO_MIN,
  type EditorSplitDirection,
} from "@puppyone/shared-ui";
import { useSplitResizeGesture } from "../interactions/useSplitResizeGesture";

export type EditorSplitResizeHandleProps = Readonly<{
  direction: EditorSplitDirection;
  ratio: number;
  splitId: string;
  onCommit: (splitId: string, ratio: number) => void;
}>;

export function EditorSplitResizeHandle({
  direction,
  ratio,
  splitId,
  onCommit,
}: EditorSplitResizeHandleProps) {
  const { t } = useLocalization();
  const gesture = useSplitResizeGesture({ direction, ratio, splitId, onCommit });

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const decrementKey = direction === "horizontal" ? "ArrowLeft" : "ArrowUp";
    const incrementKey = direction === "horizontal" ? "ArrowRight" : "ArrowDown";
    if (event.key !== decrementKey && event.key !== incrementKey) return;
    event.preventDefault();
    onCommit(splitId, ratio + (event.key === decrementKey ? -0.025 : 0.025));
  };

  return (
    <div
      className="desktop-editor-splitter"
      data-direction={direction}
      role="separator"
      tabIndex={0}
      aria-label={t("editor.panes.resize")}
      aria-orientation={direction === "horizontal" ? "vertical" : "horizontal"}
      aria-valuemin={EDITOR_SPLIT_RATIO_MIN * 100}
      aria-valuemax={EDITOR_SPLIT_RATIO_MAX * 100}
      aria-valuenow={Math.round(ratio * 100)}
      onKeyDown={handleKeyDown}
      onDoubleClick={() => onCommit(splitId, 0.5)}
      onPointerDown={gesture.start}
      onPointerMove={gesture.move}
      onPointerUp={gesture.end}
      onPointerCancel={gesture.cancel}
      onLostPointerCapture={gesture.lostCapture}
    />
  );
}
