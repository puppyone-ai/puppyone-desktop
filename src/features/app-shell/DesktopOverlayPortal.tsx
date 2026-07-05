import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { DarkThemePreset, LightThemePreset } from "../../preferences";

const DESKTOP_OVERLAY_ROOT_ID = "desktop-overlay-root";

export type DesktopOverlayTheme = "light" | "dark";

export function DesktopOverlayPortal({
  children,
  theme,
  lightThemePreset,
  darkThemePreset,
}: {
  children: ReactNode;
  theme?: DesktopOverlayTheme;
  lightThemePreset?: LightThemePreset;
  darkThemePreset?: DarkThemePreset;
}) {
  const [root, setRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const overlayRoot = getDesktopOverlayRoot();
    if (theme) applyDesktopOverlayTheme(overlayRoot, theme, lightThemePreset, darkThemePreset);
    setRoot(overlayRoot);
  }, [theme, lightThemePreset, darkThemePreset]);

  useEffect(() => {
    if (!root || !theme) return;
    applyDesktopOverlayTheme(root, theme, lightThemePreset, darkThemePreset);
  }, [root, theme, lightThemePreset, darkThemePreset]);

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

function applyDesktopOverlayTheme(
  root: HTMLElement,
  theme: DesktopOverlayTheme,
  lightThemePreset?: LightThemePreset,
  darkThemePreset?: DarkThemePreset,
) {
  root.className = `desktop-overlay-root ${theme === "dark" ? "dark" : ""}`.trim();
  root.dataset.themeMode = theme;
  if (lightThemePreset) root.dataset.lightThemePreset = lightThemePreset;
  if (darkThemePreset) root.dataset.darkThemePreset = darkThemePreset;
}
