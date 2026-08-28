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
  reload: () => Promise<ThemeCatalogState["snapshot"] | null>;
  openDirectory: () => Promise<{ opened: boolean }>;
  readCustomCss: (target: ThemeTarget) => Promise<string>;
  saveCustomCss: (target: ThemeTarget, css: string) => Promise<boolean>;
}>;

export function useThemeCatalog(options: {
  preferences?: SurfaceThemePreferences;
  colorMode?: ThemeColorMode;
  onThemePackChange?: (themeId: string) => void;
  onThemeOverrideChange?: (target: ThemeTarget, themeId: string | null) => void;
} = {}): ThemeCatalogController {
  const {
    colorMode = "light",
    preferences = DEFAULT_SURFACE_THEME_PREFERENCES,
    onThemePackChange,
    onThemeOverrideChange,
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
    if (!desktopThemes) return null;
    try {
      const snapshot = createThemeCatalogSnapshot(await desktopThemes.reload());
      setState({ snapshot, status: "ready", error: null });
      return snapshot;
    } catch (error) {
      setState((current) => ({
        ...current,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      }));
      return null;
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
      const snapshot = await reload();
      if (!snapshot) return false;
      const customTheme = snapshot.themes.find((theme) => theme.id === "local.puppyone.custom-css");
      if (
        !customTheme?.targets.includes(target)
        || !Object.prototype.hasOwnProperty.call(customTheme.compiledCss, target)
      ) {
        setState((current) => ({
          ...current,
          status: "error",
          error: "Custom CSS was saved but could not be loaded. Check the theme diagnostics.",
        }));
        return false;
      }
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
      pack: preferences.pack,
      overrides: preferences.overrides,
      selection,
      themes: state.snapshot.themes.map(({ id, name, targets }) => ({ id, name, targets })),
    }).catch(() => undefined);
  }, [desktopThemes, preferences.overrides, preferences.pack, selection, state.snapshot]);

  useEffect(() => {
    if (!desktopThemes?.onSelectionRequested) return undefined;
    return desktopThemes.onSelectionRequested((request) => {
      if (request.kind === "pack" && request.themeId) {
        onThemePackChange?.(request.themeId);
        return;
      }
      if (request.kind === "override" && request.target) {
        onThemeOverrideChange?.(request.target, request.themeId);
      }
    });
  }, [desktopThemes, onThemeOverrideChange, onThemePackChange]);

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
