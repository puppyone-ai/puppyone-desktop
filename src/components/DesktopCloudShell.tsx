import type { ReactNode } from "react";
import { AuxiliaryPanelHost } from "../features/app-shell/auxiliary";

import type { WorkspaceSurfaceId } from "../features/app-shell/workspace-surfaces";

export type DesktopView = WorkspaceSurfaceId;
export type DesktopWorkspaceKind = "local" | "cloud";

type DesktopCloudShellProps = {
  children: ReactNode;
  workspaceKind: DesktopWorkspaceKind;
  titlebarSlot?: ReactNode;
  titlebarActions?: ReactNode;
  minimalMode?: boolean;
  minimalModeDock?: ReactNode;
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
  workspaceKind,
  titlebarSlot,
  titlebarActions,
  minimalMode = false,
  minimalModeDock,
  rightSidebar,
  rightSidebarOpen = false,
  rightSidebarWidth,
  minRightSidebarWidth = 420,
  maxRightSidebarWidth = 760,
  resizableRightSidebar = false,
  onRightSidebarWidthChange,
}: DesktopCloudShellProps) {
  return (
    <div className={`desktop-shell ${minimalMode ? "is-minimal-mode" : ""}`}>
      {minimalMode ? (
        <>
          <div className="desktop-minimal-mode-drag-region" aria-hidden="true" />
          {minimalModeDock}
        </>
      ) : (
        <header className="desktop-titlebar" data-workspace-kind={workspaceKind}>
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
      )}

      <div className="desktop-shell-body">
        <main className="desktop-surface">
          {children}
        </main>
        {rightSidebar && (
          <AuxiliaryPanelHost
            open={rightSidebarOpen}
            width={rightSidebarWidth}
            minWidth={minRightSidebarWidth}
            maxWidth={maxRightSidebarWidth}
            resizable={resizableRightSidebar}
            onWidthChange={onRightSidebarWidthChange}
          >
            {rightSidebar}
          </AuxiliaryPanelHost>
        )}
      </div>
    </div>
  );
}
