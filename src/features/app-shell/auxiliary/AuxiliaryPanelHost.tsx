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
  open: boolean;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  resizable?: boolean;
  onWidthChange?: (width: number) => void;
};

export function AuxiliaryPanelHost({
  children,
  open,
  width,
  minWidth = 420,
  maxWidth = 760,
  resizable = false,
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
        onMove: (point) => onWidthChange(clamp(
          getPointerResizedSidebarWidth({
            currentX: point.clientX,
            direction,
            startWidth: resolvedWidth,
            startX,
          }),
          minWidth,
          maxWidth,
        )),
      };
    },
  });
  const panelStyle = width
    ? ({ "--desktop-right-sidebar-width": `${width}px` } as CSSProperties)
    : undefined;

  const resizeByKeyboard = (intent: SidebarResizeIntent, accelerated: boolean) => {
    if (!resizable || !onWidthChange) return;
    if (intent === "minimum" || intent === "maximum") {
      onWidthChange(intent === "minimum" ? minWidth : maxWidth);
      return;
    }
    const step = accelerated ? 24 : 12;
    onWidthChange(clamp(getArrowResizedSidebarWidth({
      currentWidth: resolvedWidth,
      direction: getDocumentDirection(),
      key: intent === "decrease" ? "ArrowLeft" : "ArrowRight",
      step,
    }), minWidth, maxWidth));
  };

  return (
    <aside className={`desktop-right-sidebar ${open ? "is-open" : ""}`} style={panelStyle}>
      {resizable && open && (
        <SidebarResizeHandle
          className="desktop-right-sidebar-resizer"
          orientation="vertical"
          label={t("shell.sidebar.resizeAuxiliary")}
          min={minWidth}
          max={maxWidth}
          value={resolvedWidth}
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
