import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { AuxiliaryPanelHost } from "../features/app-shell/auxiliary";
import { DesktopPaneLayoutProvider } from "../features/app-shell/layout/DesktopPaneLayoutContext";
import {
  DEFAULT_EXPLORER_WIDTH,
  DEFAULT_RIGHT_SIDEBAR_WIDTH,
  MIN_EXPLORER_WIDTH,
  MIN_MAIN_PANE_WIDTH,
  MIN_RIGHT_SIDEBAR_WIDTH,
  RIGHT_SIDEBAR_COLLAPSE_THRESHOLD,
  resolveDesktopPaneLayout,
} from "../features/app-shell/layout/desktopPaneLayout";
import { DesktopWindowChrome } from "./DesktopWindowChrome";

import type { WorkspaceSurfaceId } from "../features/app-shell/workspace-surfaces";

export type DesktopView = WorkspaceSurfaceId;

type DesktopCloudShellProps = {
  children: ReactNode;
  titlebarSlot?: ReactNode;
  titlebarActions?: ReactNode;
  minimalMode?: boolean;
  minimalModeDock?: ReactNode;
  leftSidebarCollapsed?: boolean;
  leftSidebarMinWidth?: number;
  leftSidebarPresent?: boolean;
  leftSidebarWidth?: number;
  mainPaneMinWidth?: number;
  rightSidebar?: ReactNode;
  rightSidebarOpen?: boolean;
  rightSidebarWidth?: number;
  minRightSidebarWidth?: number;
  resizableRightSidebar?: boolean;
  onRightSidebarOpenChange?: (open: boolean) => void;
  onRightSidebarWidthChange?: (width: number) => void;
};

export function DesktopCloudShell({
  children,
  titlebarSlot,
  titlebarActions,
  minimalMode = false,
  minimalModeDock,
  leftSidebarCollapsed = false,
  leftSidebarMinWidth = MIN_EXPLORER_WIDTH,
  leftSidebarPresent = true,
  leftSidebarWidth = DEFAULT_EXPLORER_WIDTH,
  mainPaneMinWidth = MIN_MAIN_PANE_WIDTH,
  rightSidebar,
  rightSidebarOpen = false,
  rightSidebarWidth = DEFAULT_RIGHT_SIDEBAR_WIDTH,
  minRightSidebarWidth = MIN_RIGHT_SIDEBAR_WIDTH,
  resizableRightSidebar = false,
  onRightSidebarOpenChange,
  onRightSidebarWidthChange,
}: DesktopCloudShellProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const bodyWidth = useObservedElementWidth(bodyRef);
  const paneLayout = useMemo(() => resolveDesktopPaneLayout({
    availableWidth: bodyWidth,
    explorer: {
      collapsed: leftSidebarCollapsed,
      minWidth: leftSidebarMinWidth,
      preferredWidth: leftSidebarWidth,
      present: leftSidebarPresent,
    },
    mainMinWidth: mainPaneMinWidth,
    rightSidebar: {
      minWidth: minRightSidebarWidth,
      open: rightSidebarOpen,
      preferredWidth: rightSidebarWidth,
      present: Boolean(rightSidebar),
    },
  }), [
    bodyWidth,
    leftSidebarCollapsed,
    leftSidebarMinWidth,
    leftSidebarPresent,
    leftSidebarWidth,
    mainPaneMinWidth,
    minRightSidebarWidth,
    rightSidebar,
    rightSidebarOpen,
    rightSidebarWidth,
  ]);
  const bodyStyle = {
    "--desktop-main-pane-min-width": `${paneLayout.main.minWidth}px`,
  } as CSSProperties;

  return (
    <div className={`desktop-shell ${minimalMode ? "is-minimal-mode" : ""}`}>
      <DesktopWindowChrome
        context={titlebarSlot}
        actions={titlebarActions}
        minimalMode={minimalMode}
        minimalModeDock={minimalModeDock}
      />

      <DesktopPaneLayoutProvider value={paneLayout}>
        <div ref={bodyRef} className="desktop-shell-body" style={bodyStyle}>
          <main className="desktop-surface" style={{ minWidth: paneLayout.surfaceMinWidth }}>
            {children}
          </main>
          {rightSidebar && (
            <AuxiliaryPanelHost
              collapseThreshold={RIGHT_SIDEBAR_COLLAPSE_THRESHOLD}
              open={paneLayout.rightSidebar.open}
              width={paneLayout.rightSidebar.width}
              minWidth={paneLayout.rightSidebar.minWidth}
              maxWidth={paneLayout.rightSidebar.maxWidth}
              resizable={resizableRightSidebar}
              onOpenChange={onRightSidebarOpenChange}
              onWidthChange={onRightSidebarWidthChange}
            >
              {rightSidebar}
            </AuxiliaryPanelHost>
          )}
        </div>
      </DesktopPaneLayoutProvider>
    </div>
  );
}

function useObservedElementWidth<T extends HTMLElement>(ref: RefObject<T>) {
  const [width, setWidth] = useState(() => readViewportWidth());

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const update = () => {
      const nextWidth = Math.round(element.getBoundingClientRect().width);
      if (nextWidth > 0) setWidth((current) => current === nextWidth ? current : nextWidth);
    };
    update();

    const observer = typeof ResizeObserver === "function"
      ? new ResizeObserver(update)
      : null;
    observer?.observe(element);
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [ref]);

  return width;
}

function readViewportWidth() {
  if (typeof window === "undefined") return 1440;
  return window.innerWidth || document.documentElement.clientWidth || 1440;
}
