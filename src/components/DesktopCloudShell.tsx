import type { ReactNode } from "react";
import { AuxiliaryPanelHost } from "../features/app-shell/auxiliary";
import { DesktopWindowChrome } from "./DesktopWindowChrome";

import type { WorkspaceSurfaceId } from "../features/app-shell/workspace-surfaces";

export type DesktopView = WorkspaceSurfaceId;

type DesktopCloudShellProps = {
  children: ReactNode;
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
      <DesktopWindowChrome
        context={titlebarSlot}
        actions={titlebarActions}
        minimalMode={minimalMode}
        minimalModeDock={minimalModeDock}
      />

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
