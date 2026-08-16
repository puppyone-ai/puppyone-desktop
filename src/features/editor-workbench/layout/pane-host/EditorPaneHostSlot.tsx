import { useLayoutEffect, useRef } from "react";

export type EditorPaneHostSlotProps = Readonly<{
  host: HTMLDivElement;
  paneId: string;
}>;

/** Reparents an existing pane host during the layout phase, before paint. */
export function EditorPaneHostSlot({ host, paneId }: EditorPaneHostSlotProps) {
  const slotRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const slot = slotRef.current;
    if (!slot) return undefined;
    slot.append(host);
    return () => {
      if (host.parentElement === slot) host.remove();
    };
  }, [host]);

  return (
    <div
      ref={slotRef}
      className="desktop-editor-pane-slot"
      data-editor-pane-slot-id={paneId}
    />
  );
}
