import { useLayoutEffect, useRef } from "react";

export type TerminalSessionHostSlotProps = Readonly<{
  focused: boolean;
  host: HTMLDivElement;
  labelledBy: string;
  panelId: string;
  sessionId: string;
}>;

/** Reparents one stable Session host into its active Group leaf before paint. */
export function TerminalSessionHostSlot({
  focused,
  host,
  labelledBy,
  panelId,
  sessionId,
}: TerminalSessionHostSlotProps) {
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
      id={panelId}
      className="desktop-terminal-session-pane"
      data-terminal-session-pane-id={sessionId}
      data-focused={focused ? "true" : undefined}
      role="region"
      aria-labelledby={labelledBy}
    >
    </div>
  );
}
