import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Plus } from "lucide-react";
import { useLocalization } from "@puppyone/localization/react";
import {
  DesktopMenuIconButton,
  DesktopMenuItem,
  DesktopMenuSurface,
} from "../../../components/DesktopMenu";
import { DesktopOverlayLayer } from "../../app-shell/DesktopOverlayPortal";
import { useAnchoredOverlayPosition } from "../../app-shell/useAnchoredOverlayPosition";
import type { TerminalWorkbenchCreateOption } from "./TerminalWorkbenchHeader.types";

export function TerminalWorkbenchCreateMenu({
  options,
}: {
  options: readonly TerminalWorkbenchCreateOption[];
}) {
  const { t } = useLocalization();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const label = t("terminal.new");
  const { overlayRef, setOverlayRef, overlayPosition } = useAnchoredOverlayPosition({
    open,
    anchorRef: triggerRef,
    boundarySelector: ".desktop-terminal-panel",
    preferredWidth: 184,
    preferredMaxHeight: 240,
    gap: 4,
    margin: 8,
  });

  useEffect(() => {
    if (!open) return undefined;
    const dismiss = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (target && (triggerRef.current?.contains(target) || overlayRef.current?.contains(target))) {
        return;
      }
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.querySelector("button")?.focus();
    };
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("keydown", handleKeyDown, true);
    const frame = requestAnimationFrame(() => {
      overlayRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')
        ?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open, overlayRef]);

  const menuStyle = overlayPosition
    ? {
        left: overlayPosition.left,
        top: overlayPosition.top,
        width: overlayPosition.width,
        maxHeight: overlayPosition.maxHeight,
      }
    : {
        left: 0,
        top: 0,
        width: 184,
        maxHeight: 240,
        visibility: "hidden",
        pointerEvents: "none",
      } satisfies CSSProperties;

  return (
    <>
      <div ref={triggerRef}>
        <DesktopMenuIconButton
          className="desktop-terminal-new-button"
          label={label}
          icon={<Plus size={14} strokeWidth={1.9} aria-hidden="true" />}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        />
      </div>
      {open && (
        <DesktopOverlayLayer>
          <DesktopMenuSurface
            ref={setOverlayRef}
            ariaLabel={label}
            className="desktop-terminal-create-menu"
            style={menuStyle}
          >
            {options.map((option) => (
              <DesktopMenuItem
                key={option.id}
                label={option.label}
                role="menuitem"
                disabled={option.disabled}
                onClick={() => {
                  if (option.disabled) return;
                  setOpen(false);
                  option.onCreate();
                }}
              />
            ))}
          </DesktopMenuSurface>
        </DesktopOverlayLayer>
      )}
    </>
  );
}
