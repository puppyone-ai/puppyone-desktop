import type { ReactNode } from "react";

type DesktopWindowChromeProps = {
  context?: ReactNode;
  actions?: ReactNode;
  minimalMode?: boolean;
  minimalModeDock?: ReactNode;
};

/**
 * Owns the renderer-side native window chrome boundary.
 *
 * Product surfaces and shared editors must remain inside the sibling
 * workbench subtree and must never participate in Electron's draggable-region
 * hit testing.
 */
export function DesktopWindowChrome({
  context,
  actions,
  minimalMode = false,
  minimalModeDock,
}: DesktopWindowChromeProps) {
  if (minimalMode) {
    return (
      <>
        <DesktopWindowDragRegion className="desktop-minimal-mode-drag-region" />
        {minimalModeDock}
      </>
    );
  }

  return (
    <header className="desktop-titlebar" data-window-drag-region="true">
      <div className="desktop-titlebar-left">
        {context}
      </div>
      <div
        className="desktop-titlebar-drag-fill"
        data-window-drag-region="true"
        aria-hidden="true"
      />
      {actions && (
        <div className="desktop-titlebar-actions">
          {actions}
        </div>
      )}
    </header>
  );
}

export function DesktopWindowDragRegion({ className }: { className: string }) {
  return (
    <div
      className={className}
      data-window-drag-region="true"
      aria-hidden="true"
    />
  );
}
