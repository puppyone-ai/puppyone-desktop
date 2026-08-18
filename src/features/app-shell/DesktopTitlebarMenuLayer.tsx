import type { CSSProperties, ReactNode, RefObject } from "react";
import { DesktopMenuSurface } from "../../components/DesktopMenu";
import { DesktopOverlayLayer } from "./DesktopOverlayPortal";
import { useAnchoredOverlayPosition } from "./useAnchoredOverlayPosition";

type DesktopTitlebarMenuLayerProps = {
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  className: string;
  gap?: number;
  open: boolean;
  preferredMaxHeight: number;
};

/**
 * Keeps Header controls in the native chrome tree while rendering their
 * floating menus in the shared overlay root. Header width and clipping must
 * never determine whether a menu is visible.
 */
export function DesktopTitlebarMenuLayer({
  anchorRef,
  children,
  className,
  gap = 4,
  open,
  preferredMaxHeight,
}: DesktopTitlebarMenuLayerProps) {
  const { setOverlayRef, overlayPosition } = useAnchoredOverlayPosition({
    open,
    anchorRef,
    preferredWidth: 360,
    preferredMaxHeight,
    gap,
    margin: 8,
  });

  if (!open) return null;

  const style = overlayPosition
    ? {
        left: overlayPosition.left,
        top: overlayPosition.top,
        width: overlayPosition.width,
        maxHeight: overlayPosition.maxHeight,
      }
    : {
        left: 0,
        top: 0,
        width: 360,
        maxHeight: preferredMaxHeight,
        visibility: "hidden",
        pointerEvents: "none",
      } satisfies CSSProperties;

  return (
    <DesktopOverlayLayer>
      <DesktopMenuSurface
        ref={setOverlayRef}
        className={`desktop-titlebar-menu desktop-titlebar-menu-overlay ${className}`}
        data-titlebar-context-menu="true"
        style={style}
      >
        {children}
      </DesktopMenuSurface>
    </DesktopOverlayLayer>
  );
}
