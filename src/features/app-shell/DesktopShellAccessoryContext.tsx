import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

const DesktopShellNavigationToolbarHostContext = createContext<HTMLElement | null>(null);

export function DesktopShellAccessoryProvider({
  children,
  navigationToolbarHost,
}: {
  children: ReactNode;
  navigationToolbarHost: HTMLElement | null;
}) {
  return (
    <DesktopShellNavigationToolbarHostContext.Provider value={navigationToolbarHost}>
      {children}
    </DesktopShellNavigationToolbarHostContext.Provider>
  );
}

/**
 * Places App Shell navigation in the chrome-owned toolbar without coupling a
 * workspace surface to the Shell's DOM order. Interface composition decides
 * whether this host is used; editors and Shared UI remain unaware of it.
 */
export function DesktopShellNavigationToolbarPortal({ children }: { children: ReactNode }) {
  const host = useContext(DesktopShellNavigationToolbarHostContext);
  return host ? createPortal(children, host) : null;
}
