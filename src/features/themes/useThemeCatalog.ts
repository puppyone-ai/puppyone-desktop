import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DesktopThemeSnapshot } from "../../types/electron";
import { createThemeCatalogSnapshot } from "./builtinSurfaceThemes";
import type { ThemeCatalogState } from "./themeTypes";
import type { SurfaceThemePreferences } from "./themePreferences";
import {
  DEFAULT_SURFACE_THEME_PREFERENCES,
  resolveSurfaceThemeSelection,
  type SurfaceThemeSelection,
} from "./themePreferences";
import type { ThemeColorMode } from "./themeTypes";

const EMPTY_HOST_SNAPSHOT: DesktopThemeSnapshot = Object.freeze({
  themes: Object.freeze([]),
  diagnostics: Object.freeze([]),
});

export type ThemeCatalogController = ThemeCatalogState & Readonly<{
  selection: SurfaceThemeSelection;
  openDirectory: () => Promise<{ opened: boolean }>;
}>;

export function useThemeCatalog(options: {
  preferences?: SurfaceThemePreferences;
  colorMode?: ThemeColorMode;
  onThemePackChange?: (themeId: string) => void;
} = {}): ThemeCatalogController {
  const {
    colorMode = "light",
    preferences = DEFAULT_SURFACE_THEME_PREFERENCES,
    onThemePackChange,
  } = options;
  const desktopThemes = window.puppyoneDesktop?.themes;
  const refreshGeneration = useRef(0);
  const [state, setState] = useState<ThemeCatalogState>(() => ({
    snapshot: createThemeCatalogSnapshot(EMPTY_HOST_SNAPSHOT),
    status: desktopThemes ? "loading" : "ready",
    error: null,
  }));

  const refresh = useCallback(async () => {
    if (!desktopThemes) return null;
    const generation = refreshGeneration.current + 1;
    refreshGeneration.current = generation;
    try {
      const snapshot = createThemeCatalogSnapshot(await desktopThemes.list());
      if (generation !== refreshGeneration.current) return null;
      setState({ snapshot, status: "ready", error: null });
      return snapshot;
    } catch (error) {
      if (generation !== refreshGeneration.current) return null;
      setState((current) => ({
        ...current,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      }));
      return null;
    }
  }, [desktopThemes]);

  useEffect(() => {
    if (!desktopThemes) {
      setState({
        snapshot: createThemeCatalogSnapshot(EMPTY_HOST_SNAPSHOT),
        status: "ready",
        error: null,
      });
      return undefined;
    }
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      refreshGeneration.current += 1;
      window.removeEventListener("focus", onFocus);
    };
  }, [desktopThemes, refresh]);

  const openDirectory = useCallback(async () => {
    if (!desktopThemes) return { opened: false };
    try {
      return await desktopThemes.openDirectory();
    } catch (error) {
      setState((current) => ({
        ...current,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      }));
      return { opened: false };
    }
  }, [desktopThemes]);

  const selection = useMemo(
    () => resolveSurfaceThemeSelection(preferences, state.snapshot, colorMode),
    [colorMode, preferences, state.snapshot],
  );

  useEffect(() => {
    if (!desktopThemes?.syncNativeMenu) return;
    void desktopThemes.syncNativeMenu({
      pack: preferences.pack,
      themes: state.snapshot.themes.map(({ id, name, targets }) => ({ id, name, targets })),
    }).catch(() => undefined);
  }, [desktopThemes, preferences.pack, state.snapshot]);

  useEffect(() => {
    if (!desktopThemes?.onSelectionRequested) return undefined;
    return desktopThemes.onSelectionRequested((request) => {
      if (request.kind === "pack" && request.themeId) {
        onThemePackChange?.(request.themeId);
      }
    });
  }, [desktopThemes, onThemePackChange]);

  return {
    ...state,
    selection,
    openDirectory,
  };
}
