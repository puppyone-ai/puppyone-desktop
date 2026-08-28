import { useCallback, useEffect, useState } from "react";
import type { DesktopThemeSnapshot } from "../../types/electron";
import { createThemeCatalogSnapshot } from "./builtinSurfaceThemes";
import type { ThemeCatalogState } from "./themeTypes";
import type { SurfaceThemePreferences } from "./themePreferences";
import type { ThemeTarget } from "./themeTypes";

const EMPTY_HOST_SNAPSHOT: DesktopThemeSnapshot = Object.freeze({
  themes: Object.freeze([]),
  diagnostics: Object.freeze([]),
});

export type ThemeCatalogController = ThemeCatalogState & Readonly<{
  reload: () => Promise<void>;
  openDirectory: () => Promise<{ opened: boolean }>;
}>;

export function useThemeCatalog(options: {
  preferences?: SurfaceThemePreferences;
  onThemeChange?: (target: ThemeTarget, themeId: string) => void;
} = {}): ThemeCatalogController {
  const { preferences, onThemeChange } = options;
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
    return desktopThemes.openDirectory();
  }, [desktopThemes]);

  useEffect(() => {
    if (!desktopThemes?.syncNativeMenu || !preferences) return;
    void desktopThemes.syncNativeMenu({
      selection: preferences,
      themes: state.snapshot.themes.map(({ id, name, targets }) => ({ id, name, targets })),
    }).catch(() => undefined);
  }, [desktopThemes, preferences, state.snapshot]);

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

  return { ...state, reload, openDirectory };
}
