import { type CSSProperties, type ReactNode } from "react";
import {
  SidebarResizeHandle,
  usePaneResizeDrag,
  type SidebarResizeIntent,
} from "@puppyone/shared-ui";
import { useLocalization } from "@puppyone/localization";
import {
  getArrowResizedSidebarWidth,
  getPointerResizedSidebarWidth,
  type InlineDirection,
} from "../../../components/auxiliarySidebarGeometry";

export type AuxiliaryPanelHostProps = {
  children: ReactNode;
  collapseThreshold?: number;
  open: boolean;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  resizable?: boolean;
  onOpenChange?: (open: boolean) => void;
  onWidthChange?: (width: number) => void;
};

export function AuxiliaryPanelHost({
  children,
  collapseThreshold = 0,
  open,
  width,
  minWidth = 420,
  maxWidth = 760,
  resizable = false,
  onOpenChange,
  onWidthChange,
}: AuxiliaryPanelHostProps) {
  const { t } = useLocalization();
  const resolvedWidth = width ?? 560;
  const beginResize = usePaneResizeDrag({
    enabled: resizable && Boolean(onWidthChange),
    bodyClassName: "desktop-right-sidebar-resizing",
    onDragStart: (event) => {
      if (!onWidthChange) return null;
      const startX = event.clientX;
      const direction = getDocumentDirection();
      return {
        onMove: (point) => {
          const nextWidth = getPointerResizedSidebarWidth({
            currentX: point.clientX,
            direction,
            startWidth: resolvedWidth,
            startX,
          });
          if (onOpenChange && nextWidth < collapseThreshold) {
            onOpenChange(false);
            return;
          }
          onOpenChange?.(true);
          onWidthChange(clamp(nextWidth, minWidth, maxWidth));
        },
      };
    },
  });
  const panelStyle = width !== undefined
    ? ({ "--desktop-right-sidebar-width": `${width}px` } as CSSProperties)
    : undefined;

  const resizeByKeyboard = (intent: SidebarResizeIntent, accelerated: boolean) => {
    if (!resizable || !onWidthChange) return;
    if (intent === "minimum" || intent === "maximum") {
      if (intent === "minimum" && onOpenChange) {
        onOpenChange(false);
        return;
      }
      onOpenChange?.(true);
      onWidthChange(intent === "minimum" ? minWidth : maxWidth);
      return;
    }
    const step = accelerated ? 24 : 12;
    const nextWidth = getArrowResizedSidebarWidth({
      currentWidth: resolvedWidth,
      direction: getDocumentDirection(),
      key: intent === "decrease" ? "ArrowLeft" : "ArrowRight",
      step,
    });
    if (onOpenChange && nextWidth < minWidth) {
      onOpenChange(false);
      return;
    }
    onWidthChange(clamp(nextWidth, minWidth, maxWidth));
  };

  return (
    <aside
      className={`desktop-right-sidebar ${open ? "is-open" : ""}`}
      style={panelStyle}
      aria-hidden={open ? undefined : true}
      {...(!open ? { inert: "" } : {})}
    >
      {resizable && (open || Boolean(onOpenChange)) && (
        <SidebarResizeHandle
          className="desktop-right-sidebar-resizer"
          paneEdge
          orientation="vertical"
          label={t("shell.sidebar.resizeAuxiliary")}
          min={onOpenChange ? 0 : minWidth}
          max={maxWidth}
          value={resolvedWidth}
          tabIndex={open ? 0 : -1}
          onPointerDown={beginResize}
          onKeyboardResize={resizeByKeyboard}
        />
      )}
      <div className="desktop-right-sidebar-inner">{children}</div>
    </aside>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getDocumentDirection(): InlineDirection {
  return document.documentElement.dir === "rtl" ? "rtl" : "ltr";
}
