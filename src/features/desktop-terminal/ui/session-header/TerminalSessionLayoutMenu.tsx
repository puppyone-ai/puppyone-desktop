import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  PanelsTopLeft,
} from "lucide-react";
import { useLocalization } from "@puppyone/localization/react";
import type { WorkbenchSplitDropEdge } from "@puppyone/shared-ui";
import {
  DesktopMenuIconButton,
  DesktopMenuItem,
  DesktopMenuSurface,
} from "../../../../components/DesktopMenu";
import { DesktopOverlayLayer } from "../../../app-shell/DesktopOverlayPortal";
import { useAnchoredOverlayPosition } from "../../../app-shell/useAnchoredOverlayPosition";
import type { TerminalSessionHeaderItem } from "./types";

type TerminalSessionLayoutMenuProps = Readonly<{
  canMove: (sessionId: string, edge: WorkbenchSplitDropEdge) => boolean;
  items: readonly TerminalSessionHeaderItem[];
  onMove: (sessionId: string, edge: WorkbenchSplitDropEdge) => void;
}>;

const MOVE_ACTIONS = [
  { edge: "left", message: "terminal.split.moveLeft", Icon: ArrowLeft },
  { edge: "right", message: "terminal.split.moveRight", Icon: ArrowRight },
  { edge: "top", message: "terminal.split.moveTop", Icon: ArrowUp },
  { edge: "bottom", message: "terminal.split.moveBottom", Icon: ArrowDown },
] as const;

/** Non-pointer equivalent for moving a Session from an inactive Group. */
export function TerminalSessionLayoutMenu({
  canMove,
  items,
  onMove,
}: TerminalSessionLayoutMenuProps) {
  const { t } = useLocalization();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const label = t("terminal.split.actions");
  const { overlayRef, setOverlayRef, overlayPosition } = useAnchoredOverlayPosition({
    open,
    anchorRef: triggerRef,
    boundarySelector: ".desktop-terminal-panel",
    preferredWidth: 292,
    preferredMaxHeight: 360,
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
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.querySelector("button")?.focus();
        return;
      }
      if (!overlayRef.current?.contains(event.target as Node)) return;
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const menuItems = Array.from(
        overlayRef.current.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'),
      );
      if (menuItems.length === 0) return;
      event.preventDefault();
      const currentIndex = menuItems.indexOf(document.activeElement as HTMLButtonElement);
      const nextIndex = event.key === "Home"
        ? 0
        : event.key === "End"
          ? menuItems.length - 1
          : event.key === "ArrowUp"
            ? (currentIndex - 1 + menuItems.length) % menuItems.length
            : (currentIndex + 1) % menuItems.length;
      menuItems[nextIndex]?.focus({ preventScroll: true });
    };
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("keydown", handleKeyDown, true);
    const frame = requestAnimationFrame(() => {
      overlayRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
        ?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open, overlayRef]);

  useEffect(() => {
    if (items.length === 0) setOpen(false);
  }, [items.length]);

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
        width: 292,
        maxHeight: 360,
        visibility: "hidden",
        pointerEvents: "none",
      } satisfies CSSProperties;

  return (
    <>
      <div className="desktop-terminal-layout-menu-wrap" ref={triggerRef}>
        <DesktopMenuIconButton
          className="desktop-terminal-layout-menu-trigger"
          label={label}
          icon={<PanelsTopLeft size={14} strokeWidth={1.8} aria-hidden="true" />}
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
            className="desktop-terminal-layout-menu"
            style={menuStyle}
          >
            {items.flatMap((item) => MOVE_ACTIONS.map(({ edge, message, Icon }) => (
              <DesktopMenuItem
                key={`${item.session.id}:${edge}`}
                disabled={!canMove(item.session.id, edge)}
                icon={<Icon size={14} strokeWidth={1.8} aria-hidden="true" />}
                label={t(message, { title: item.presentation.sessionTitle })}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onMove(item.session.id, edge);
                }}
              />
            )))}
          </DesktopMenuSurface>
        </DesktopOverlayLayer>
      )}
    </>
  );
}
