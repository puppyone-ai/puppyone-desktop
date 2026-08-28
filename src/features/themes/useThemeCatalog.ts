import { useCallback, useEffect, useState } from "react";
import type { DesktopThemeSnapshot } from "../../types/electron";
import { createThemeCatalogSnapshot } from "./builtinSurfaceThemes";
import type { ThemeCatalogState } from "./themeTypes";

const EMPTY_HOST_SNAPSHOT: DesktopThemeSnapshot = Object.freeze({
  themes: Object.freeze([]),
  diagnostics: Object.freeze([]),
});

export type ThemeCatalogController = ThemeCatalogState & Readonly<{
  reload: () => Promise<void>;
  openDirectory: () => Promise<{ opened: boolean }>;
}>;

export function useThemeCatalog(): ThemeCatalogController {
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

  return { ...state, reload, openDirectory };
}
