import {
  useCallback,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { usePaneResizeDrag } from "@puppyone/shared-ui";

export type DesktopView = "data" | "git" | "cloud" | "access" | "integrations" | "settings";

type DesktopCloudShellProps = {
  children: ReactNode;
  titlebarSlot?: ReactNode;
  titlebarActions?: ReactNode;
  rightSidebar?: ReactNode;
  rightSidebarOpen?: boolean;
  rightSidebarWidth?: number;
  minRightSidebarWidth?: number;
  maxRightSidebarWidth?: number;
  resizableRightSidebar?: boolean;
  onRightSidebarWidthChange?: (width: number) => void;
};

export function DesktopCloudShell({
  children,
  titlebarSlot,
  titlebarActions,
  rightSidebar,
  rightSidebarOpen = false,
  rightSidebarWidth,
  minRightSidebarWidth = 420,
  maxRightSidebarWidth = 760,
  resizableRightSidebar = false,
  onRightSidebarWidthChange,
}: DesktopCloudShellProps) {
  const beginRightSidebarResize = usePaneResizeDrag({
    enabled: resizableRightSidebar && Boolean(onRightSidebarWidthChange),
    bodyClassName: "desktop-right-sidebar-resizing",
    onDragStart: (event) => {
      if (!onRightSidebarWidthChange) return null;

      const startX = event.clientX;
      const startWidth = rightSidebarWidth ?? 560;

      return {
        onMove: (point) => {
          const nextWidth = clamp(
            startWidth + startX - point.clientX,
            minRightSidebarWidth,
            maxRightSidebarWidth,
          );
          onRightSidebarWidthChange(nextWidth);
        },
      };
    },
  });

  const rightSidebarStyle = rightSidebarWidth
    ? ({ "--desktop-right-sidebar-width": `${rightSidebarWidth}px` } as CSSProperties)
    : undefined;

  const nudgeRightSidebarWidth = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!resizableRightSidebar || !onRightSidebarWidthChange) return;

      const currentWidth = rightSidebarWidth ?? 560;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onRightSidebarWidthChange(clamp(currentWidth + (event.shiftKey ? 24 : 12), minRightSidebarWidth, maxRightSidebarWidth));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        onRightSidebarWidthChange(clamp(currentWidth - (event.shiftKey ? 24 : 12), minRightSidebarWidth, maxRightSidebarWidth));
      } else if (event.key === "Home") {
        event.preventDefault();
        onRightSidebarWidthChange(minRightSidebarWidth);
      } else if (event.key === "End") {
        event.preventDefault();
        onRightSidebarWidthChange(maxRightSidebarWidth);
      }
    },
    [
      maxRightSidebarWidth,
      minRightSidebarWidth,
      onRightSidebarWidthChange,
      resizableRightSidebar,
      rightSidebarWidth,
    ],
  );

  return (
    <div className="desktop-shell">
      <header className="desktop-titlebar">
        <div className="desktop-titlebar-left">
          {titlebarSlot}
        </div>
        <div className="desktop-titlebar-drag-fill" aria-hidden="true" />
        {titlebarActions && (
          <div className="desktop-titlebar-actions">
            {titlebarActions}
          </div>
        )}
      </header>

      <div className="desktop-shell-body">
        <main className="desktop-surface">
          {children}
        </main>
        {rightSidebar && (
          <aside
            className={`desktop-right-sidebar ${rightSidebarOpen ? "is-open" : ""}`}
            style={rightSidebarStyle}
          >
            {resizableRightSidebar && rightSidebarOpen && (
              <div
                className="desktop-right-sidebar-resizer"
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize right sidebar"
                tabIndex={0}
                onPointerDown={beginRightSidebarResize}
                onKeyDown={nudgeRightSidebarWidth}
              />
            )}
            <div className="desktop-right-sidebar-inner">
              {rightSidebar}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
