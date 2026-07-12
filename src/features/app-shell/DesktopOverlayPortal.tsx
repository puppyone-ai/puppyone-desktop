import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { DarkThemePreset, DiffMarkers, LightThemePreset, TextSize } from "../../preferences";
import {
  applyTypographyToElement,
  type ResolvedTypography,
} from "../typography";

const DESKTOP_OVERLAY_ROOT_ID = "desktop-overlay-root";

export type DesktopOverlayTheme = "light" | "dark";

export function DesktopOverlayPortal({
  children,
  theme,
  lightThemePreset,
  darkThemePreset,
  textSize,
  typography,
  pointerCursors,
  diffMarkers,
}: {
  children: ReactNode;
  theme?: DesktopOverlayTheme;
  lightThemePreset?: LightThemePreset;
  darkThemePreset?: DarkThemePreset;
  textSize?: TextSize;
  typography?: ResolvedTypography;
  pointerCursors?: boolean;
  diffMarkers?: DiffMarkers;
}) {
  const [root, setRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const overlayRoot = getDesktopOverlayRoot();
    if (theme) {
      applyDesktopOverlayTheme(
        overlayRoot,
        theme,
        lightThemePreset,
        darkThemePreset,
        textSize,
        typography,
        pointerCursors,
        diffMarkers,
      );
    }
    setRoot(overlayRoot);
  }, [theme, lightThemePreset, darkThemePreset, textSize, typography, pointerCursors, diffMarkers]);

  useLayoutEffect(() => {
    if (!root || !theme) return;
    applyDesktopOverlayTheme(root, theme, lightThemePreset, darkThemePreset, textSize, typography, pointerCursors, diffMarkers);
  }, [root, theme, lightThemePreset, darkThemePreset, textSize, typography, pointerCursors, diffMarkers]);

  if (!root) return null;
  return createPortal(children, root);
}

function getDesktopOverlayRoot() {
  const existing = document.getElementById(DESKTOP_OVERLAY_ROOT_ID);
  if (existing instanceof HTMLElement) {
    existing.dataset.poOverlayRoot = "true";
    return existing;
  }

  const root = document.createElement("div");
  root.id = DESKTOP_OVERLAY_ROOT_ID;
  root.className = "desktop-overlay-root";
  root.dataset.poOverlayRoot = "true";
  document.body.appendChild(root);
  return root;
}

function applyDesktopOverlayTheme(
  root: HTMLElement,
  theme: DesktopOverlayTheme,
  lightThemePreset?: LightThemePreset,
  darkThemePreset?: DarkThemePreset,
  textSize?: TextSize,
  typography?: ResolvedTypography,
  pointerCursors?: boolean,
  diffMarkers?: DiffMarkers,
) {
  root.className = `desktop-overlay-root ${theme === "dark" ? "dark" : ""}`.trim();
  root.dataset.themeMode = theme;
  if (lightThemePreset) root.dataset.lightThemePreset = lightThemePreset;
  if (darkThemePreset) root.dataset.darkThemePreset = darkThemePreset;
  if (textSize) root.dataset.textSize = textSize;
  if (typography) applyTypographyToElement(root, typography);
  if (pointerCursors !== undefined) root.dataset.pointerCursors = pointerCursors ? "true" : "false";
  if (diffMarkers) root.dataset.diffMarkers = diffMarkers;
}
