import { useEffect, useRef } from "react";

export type InteractionTerminationReason =
  | "blur"
  | "dragend"
  | "drop"
  | "escape"
  | "hidden"
  | "pagehide"
  | "unmount";

export type UseInteractionTerminationOptions = Readonly<{
  finish: (reason: InteractionTerminationReason) => boolean;
  includeHtmlDragEvents?: boolean;
}>;

/** Installs one renderer lifecycle boundary for a pointer or drag session. */
export function useInteractionTermination({
  finish,
  includeHtmlDragEvents = false,
}: UseInteractionTerminationOptions): void {
  const finishRef = useRef(finish);
  finishRef.current = finish;

  useEffect(() => {
    const terminate = (reason: InteractionTerminationReason) => {
      finishRef.current(reason);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (finishRef.current("escape")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") terminate("hidden");
    };
    const handleBlur = () => terminate("blur");
    const handlePageHide = () => terminate("pagehide");
    const handleDragEnd = () => terminate("dragend");
    const handleDrop = () => terminate("drop");

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("blur", handleBlur, true);
    window.addEventListener("pagehide", handlePageHide, true);
    document.addEventListener("visibilitychange", handleVisibilityChange, true);
    if (includeHtmlDragEvents) {
      window.addEventListener("dragend", handleDragEnd, true);
      window.addEventListener("drop", handleDrop, true);
    }

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("blur", handleBlur, true);
      window.removeEventListener("pagehide", handlePageHide, true);
      document.removeEventListener("visibilitychange", handleVisibilityChange, true);
      if (includeHtmlDragEvents) {
        window.removeEventListener("dragend", handleDragEnd, true);
        window.removeEventListener("drop", handleDrop, true);
      }
      terminate("unmount");
    };
  }, [includeHtmlDragEvents]);
}
