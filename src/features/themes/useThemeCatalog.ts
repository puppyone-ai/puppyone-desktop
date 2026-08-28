import { useCallback, useEffect, useMemo, useState } from "react";
import type { DesktopThemeSnapshot } from "../../types/electron";
import { createThemeCatalogSnapshot } from "./builtinSurfaceThemes";
import type { ThemeCatalogState } from "./themeTypes";
import type { SurfaceThemePreferences } from "./themePreferences";
import {
  DEFAULT_SURFACE_THEME_PREFERENCES,
  resolveSurfaceThemeSelection,
  type SurfaceThemeSelection,
} from "./themePreferences";
import type { ThemeColorMode, ThemeTarget } from "./themeTypes";

const EMPTY_HOST_SNAPSHOT: DesktopThemeSnapshot = Object.freeze({
  themes: Object.freeze([]),
  diagnostics: Object.freeze([]),
});

export type ThemeCatalogController = ThemeCatalogState & Readonly<{
  selection: SurfaceThemeSelection;
  reload: () => Promise<void>;
  openDirectory: () => Promise<{ opened: boolean }>;
  readCustomCss: (target: ThemeTarget) => Promise<string>;
  saveCustomCss: (target: ThemeTarget, css: string) => Promise<boolean>;
}>;

export function useThemeCatalog(options: {
  preferences?: SurfaceThemePreferences;
  colorMode?: ThemeColorMode;
  onThemeChange?: (target: ThemeTarget, themeId: string) => void;
} = {}): ThemeCatalogController {
  const {
    colorMode = "light",
    preferences = DEFAULT_SURFACE_THEME_PREFERENCES,
    onThemeChange,
  } = options;
  const desktopThemes = window.puppyoneDesktop?.themes;
  const [state, setState] = useState<ThemeCatalogState>(() => ({
    snapshot: createThemeCatalogSnapshot(EMPTY_HOST_SNAPSHOT),
    status: desktopThemes ? "loading" : "ready",
    error: null,
  }));

  useEffect(() => {
    let cancelled = false;
    if (!desktopThemes) {
      setState({
        snapshot: createThemeCatalogSnapshot(EMPTY_HOST_SNAPSHOT),
        status: "ready",
        error: null,
      });
      return () => {
        cancelled = true;
      };
    }
    void desktopThemes.list()
      .then((snapshot) => {
        if (cancelled) return;
        setState({ snapshot: createThemeCatalogSnapshot(snapshot), status: "ready", error: null });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({
          snapshot: createThemeCatalogSnapshot(EMPTY_HOST_SNAPSHOT),
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [desktopThemes]);

  const reload = useCallback(async () => {
    if (!desktopThemes) return;
    try {
      const snapshot = await desktopThemes.reload();
      setState({ snapshot: createThemeCatalogSnapshot(snapshot), status: "ready", error: null });
    } catch (error) {
      setState((current) => ({
        ...current,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }, [desktopThemes]);

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

  const readCustomCss = useCallback(async (target: ThemeTarget) => {
    if (!desktopThemes?.readCustomCss) return "";
    try {
      const result = await desktopThemes.readCustomCss(target);
      return result.css;
    } catch (error) {
      setState((current) => ({
        ...current,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      }));
      throw error;
    }
  }, [desktopThemes]);

  const saveCustomCss = useCallback(async (target: ThemeTarget, css: string) => {
    if (!desktopThemes?.saveCustomCss) return false;
    try {
      await desktopThemes.saveCustomCss({ target, css });
      await reload();
      return true;
    } catch (error) {
      setState((current) => ({
        ...current,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      }));
      return false;
    }
  }, [desktopThemes, reload]);

  useEffect(() => {
    if (!desktopThemes?.syncNativeMenu) return;
    void desktopThemes.syncNativeMenu({
      selection,
      themes: state.snapshot.themes.map(({ id, name, targets }) => ({ id, name, targets })),
    }).catch(() => undefined);
  }, [desktopThemes, selection, state.snapshot]);

  useEffect(() => {
    if (!desktopThemes?.onSelectionRequested || !onThemeChange) return undefined;
    return desktopThemes.onSelectionRequested(({ target, themeId }) => {
      onThemeChange(target, themeId);
    });
  }, [desktopThemes, onThemeChange]);

  useEffect(() => {
    if (!desktopThemes?.onReloadRequested) return undefined;
    return desktopThemes.onReloadRequested(() => {
      void reload();
    });
  }, [desktopThemes, reload]);

  return {
    ...state,
    selection,
    reload,
    openDirectory,
    readCustomCss,
    saveCustomCss,
  };
}
