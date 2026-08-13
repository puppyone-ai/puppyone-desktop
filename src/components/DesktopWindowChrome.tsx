import { useEffect, useState, type ReactNode } from "react";

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
  const fullScreen = useWindowFullScreenState();

  if (minimalMode) {
    return (
      <>
        <DesktopWindowDragRegion className="desktop-minimal-mode-drag-region" />
        {minimalModeDock}
      </>
    );
  }

  return (
    <header
      className="desktop-titlebar"
      data-window-drag-region="true"
      data-window-full-screen={fullScreen ? "true" : undefined}
    >
      <div className="desktop-titlebar-layout">
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
      </div>
    </header>
  );
}

function useWindowFullScreenState() {
  const [fullScreen, setFullScreen] = useState(false);

  useEffect(() => {
    const bridge = window.puppyoneDesktop;
    if (!bridge?.getWindowChromeState || !bridge.onWindowChromeStateChanged) return undefined;

    let active = true;
    const applyState = (state: { fullScreen: boolean }) => {
      if (active) setFullScreen(state?.fullScreen === true);
    };
    const stopListening = bridge.onWindowChromeStateChanged(applyState);
    void bridge.getWindowChromeState().then(applyState).catch(() => undefined);

    return () => {
      active = false;
      stopListening();
    };
  }, []);

  return fullScreen;
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
