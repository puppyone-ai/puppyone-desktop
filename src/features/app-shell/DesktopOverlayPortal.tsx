import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const DESKTOP_OVERLAY_ROOT_ID = "desktop-overlay-root";

export type DesktopOverlayTheme = "light" | "dark";

export function DesktopOverlayPortal({
  children,
  theme,
}: {
  children: ReactNode;
  theme?: DesktopOverlayTheme;
}) {
  const [root, setRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const overlayRoot = getDesktopOverlayRoot();
    if (theme) applyDesktopOverlayTheme(overlayRoot, theme);
    setRoot(overlayRoot);
  }, [theme]);

  useEffect(() => {
    if (!root || !theme) return;
    applyDesktopOverlayTheme(root, theme);
  }, [root, theme]);

  if (!root) return null;
  return createPortal(children, root);
}

function getDesktopOverlayRoot() {
  const existing = document.getElementById(DESKTOP_OVERLAY_ROOT_ID);
  if (existing instanceof HTMLElement) return existing;

  const root = document.createElement("div");
  root.id = DESKTOP_OVERLAY_ROOT_ID;
  root.className = "desktop-overlay-root";
  document.body.appendChild(root);
  return root;
}

function applyDesktopOverlayTheme(root: HTMLElement, theme: DesktopOverlayTheme) {
  root.className = `desktop-overlay-root ${theme === "dark" ? "dark" : ""}`.trim();
  root.dataset.themeMode = theme;
}
