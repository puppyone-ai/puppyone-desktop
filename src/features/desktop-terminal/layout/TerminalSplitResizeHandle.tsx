import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useLocalization } from "@puppyone/localization/react";
import {
  clampTerminalRatioToBounds,
  type TerminalSplitMinimumSize,
  type TerminalSplitRatioBounds,
} from "../model/terminalSplitConstraints";
import type { DesktopTerminalLayoutSplit } from "../model/terminalSessions";
import {
  measureTerminalSplitRatioBounds,
  useTerminalSplitResizeGesture,
} from "../interactions/useTerminalSplitResizeGesture";

export type TerminalSplitResizeHandleProps = Readonly<{
  direction: DesktopTerminalLayoutSplit["direction"];
  firstMinimum: TerminalSplitMinimumSize;
  secondMinimum: TerminalSplitMinimumSize;
  ratio: number;
  splitId: string;
  onCommit: (splitId: string, ratio: number) => void;
}>;

const DEFAULT_BOUNDS: TerminalSplitRatioBounds = Object.freeze({
  minimum: 0.01,
  maximum: 0.99,
});

export function TerminalSplitResizeHandle({
  direction,
  firstMinimum,
  secondMinimum,
  ratio,
  splitId,
  onCommit,
}: TerminalSplitResizeHandleProps) {
  const { t } = useLocalization();
  const handleRef = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState(DEFAULT_BOUNDS);
  const gesture = useTerminalSplitResizeGesture({
    direction,
    firstMinimum,
    secondMinimum,
    ratio,
    splitId,
    onCommit,
  });

  useLayoutEffect(() => {
    const handle = handleRef.current;
    if (!handle) return undefined;
    const update = () => {
      const next = measureTerminalSplitRatioBounds(
        handle,
        direction,
        firstMinimum,
        secondMinimum,
      );
      setBounds((current) => sameBounds(current, next) ? current : next);
    };
    update();
    if (typeof ResizeObserver !== "function" || !handle.parentElement) return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(handle.parentElement);
    return () => observer.disconnect();
  }, [direction, firstMinimum, secondMinimum]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentBounds = measureTerminalSplitRatioBounds(
      event.currentTarget,
      direction,
      firstMinimum,
      secondMinimum,
    );
    setBounds(currentBounds);
    const decrementKey = direction === "horizontal" ? "ArrowLeft" : "ArrowUp";
    const incrementKey = direction === "horizontal" ? "ArrowRight" : "ArrowDown";
    let nextRatio: number | null = null;
    if (event.key === decrementKey) nextRatio = ratio - 0.025;
    if (event.key === incrementKey) nextRatio = ratio + 0.025;
    if (event.key === "Home") nextRatio = currentBounds.minimum;
    if (event.key === "End") nextRatio = currentBounds.maximum;
    if (nextRatio === null) return;
    event.preventDefault();
    onCommit(splitId, clampTerminalRatioToBounds(nextRatio, currentBounds));
  };

  return (
    <div
      ref={handleRef}
      className="desktop-terminal-splitter"
      data-direction={direction}
      role="separator"
      tabIndex={0}
      aria-label={t("terminal.split.resize")}
      aria-orientation={direction === "horizontal" ? "vertical" : "horizontal"}
      aria-valuemin={Math.round(bounds.minimum * 100)}
      aria-valuemax={Math.round(bounds.maximum * 100)}
      aria-valuenow={Math.round(clampTerminalRatioToBounds(ratio, bounds) * 100)}
      onKeyDown={handleKeyDown}
      onDoubleClick={(event) => {
        const currentBounds = measureTerminalSplitRatioBounds(
          event.currentTarget,
          direction,
          firstMinimum,
          secondMinimum,
        );
        setBounds(currentBounds);
        onCommit(splitId, clampTerminalRatioToBounds(0.5, currentBounds));
      }}
      onPointerDown={gesture.start}
      onPointerMove={gesture.move}
      onPointerUp={gesture.end}
      onPointerCancel={gesture.cancel}
      onLostPointerCapture={gesture.lostCapture}
    />
  );
}

function sameBounds(left: TerminalSplitRatioBounds, right: TerminalSplitRatioBounds) {
  return left.minimum === right.minimum && left.maximum === right.maximum;
}
