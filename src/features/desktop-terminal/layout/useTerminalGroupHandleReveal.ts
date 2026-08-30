import {
  useCallback,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
} from "react";

/** Matches the Editor/Ghostty interaction: reveal chrome in the upper third. */
export const TERMINAL_GROUP_HANDLE_REVEAL_RATIO = 1 / 3;

export function useTerminalGroupHandleReveal(
  groupRef: RefObject<HTMLElement | null>,
  forcedOpen: boolean,
) {
  const hotRef = useRef(false);
  const [hot, setHot] = useState(false);

  const setHotIfChanged = useCallback((next: boolean) => {
    if (hotRef.current === next) return;
    hotRef.current = next;
    setHot(next);
  }, []);

  const onPointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    const group = groupRef.current;
    if (!group) return;
    setHotIfChanged(isPointInTerminalGroupHandleRevealZone(
      group.getBoundingClientRect(),
      event.clientX,
      event.clientY,
    ));
  }, [groupRef, setHotIfChanged]);

  const onPointerLeave = useCallback(() => setHotIfChanged(false), [setHotIfChanged]);

  return {
    revealed: hot || forcedOpen,
    onPointerMove,
    onPointerLeave,
  } as const;
}

export function isPointInTerminalGroupHandleRevealZone(
  rect: Pick<DOMRect, "left" | "right" | "top" | "height">,
  clientX: number,
  clientY: number,
): boolean {
  return clientX >= rect.left
    && clientX <= rect.right
    && clientY >= rect.top
    && clientY < rect.top + rect.height * TERMINAL_GROUP_HANDLE_REVEAL_RATIO;
}
