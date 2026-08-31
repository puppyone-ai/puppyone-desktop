import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  SidebarResizeHandle,
  useCollapsiblePaneResize,
  type SidebarResizeIntent,
} from "@puppyone/shared-ui";
import { useLocalization } from "@puppyone/localization";
import {
  getArrowResizedSidebarWidth,
  type InlineDirection,
} from "../../../components/auxiliarySidebarGeometry";
import { useNativeSurfacePointerPassthroughActivity } from "../../native-surfaces";

export type AuxiliaryPanelHostProps = {
  children: ReactNode;
  collapseThreshold?: number;
  open: boolean;
  width?: number;
  expandedWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  resizable?: boolean;
  onOpenChange?: (open: boolean) => void;
  onWidthChange?: (width: number) => void;
};

const PANE_COLLAPSE_ANIMATION_MS = 260;

export function AuxiliaryPanelHost({
  children,
  collapseThreshold = 0,
  open,
  width,
  expandedWidth,
  minWidth = 320,
  maxWidth = 760,
  resizable = false,
  onOpenChange,
  onWidthChange,
}: AuxiliaryPanelHostProps) {
  const { t } = useLocalization();
  const resolvedWidth = width ?? 560;
  const expandedWidthRef = useRef(clamp(
    resolvedWidth > 0 ? resolvedWidth : expandedWidth ?? 560,
    minWidth,
    maxWidth,
  ));
  const wasOpenRef = useRef(open);
  const [collapsedEdgeSettled, setCollapsedEdgeSettled] = useState(!open);
  const onResizeActiveChange = useNativeSurfacePointerPassthroughActivity(
    "auxiliary-panel-resize",
  );

  useEffect(() => {
    if (open) {
      setCollapsedEdgeSettled(false);
      return undefined;
    }

    const timeoutId = window.setTimeout(
      () => setCollapsedEdgeSettled(true),
      PANE_COLLAPSE_ANIMATION_MS,
    );
    return () => window.clearTimeout(timeoutId);
  }, [open]);

  const resize = useCollapsiblePaneResize({
    enabled: resizable && Boolean(onWidthChange),
    bodyClassName: "desktop-right-sidebar-resizing",
    collapsed: !open,
    collapsedWidth: 0,
    collapseThreshold,
    direction: getDocumentDirection(),
    maxWidth,
    minWidth,
    side: "inline-end",
    width: resolvedWidth,
    onCollapsedChange: onOpenChange
      ? (collapsed) => onOpenChange(!collapsed)
      : undefined,
    onDragActiveChange: onResizeActiveChange,
    onWidthChange: onWidthChange ?? noop,
  });
  if (open) {
    expandedWidthRef.current = clamp(resize.width, minWidth, maxWidth);
  } else if (!wasOpenRef.current && expandedWidth !== undefined) {
    expandedWidthRef.current = clamp(expandedWidth, minWidth, maxWidth);
  }
  wasOpenRef.current = open;
  const panelStyle = {
    "--desktop-right-sidebar-width": `${expandedWidthRef.current}px`,
  } as CSSProperties;
  const collapsedEdgeVisible = !open && collapsedEdgeSettled;

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
    >
      {resizable && (open || Boolean(onOpenChange)) && (
        <SidebarResizeHandle
          className="desktop-right-sidebar-resizer"
          paneEdge
          collapsedEdgeSide={collapsedEdgeVisible ? "inline-end" : undefined}
          orientation="vertical"
          label={t(collapsedEdgeVisible
            ? "shell.sidebar.expandAuxiliary"
            : "shell.sidebar.resizeAuxiliary")}
          min={onOpenChange ? 0 : minWidth}
          max={maxWidth}
          value={resize.width}
          tabIndex={open || collapsedEdgeVisible ? 0 : -1}
          onCollapsedActivate={collapsedEdgeVisible
            ? () => onOpenChange?.(true)
            : undefined}
          onPointerDown={resize.onPointerDown}
          onKeyboardResize={resizeByKeyboard}
        />
      )}
      <div className="desktop-right-sidebar-viewport">
        <div
          className="desktop-right-sidebar-inner"
          aria-hidden={open ? undefined : true}
          {...(!open ? { inert: "" } : {})}
        >
          {children}
        </div>
      </div>
    </aside>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getDocumentDirection(): InlineDirection {
  return document.documentElement.dir === "rtl" ? "rtl" : "ltr";
}

function noop() {}
