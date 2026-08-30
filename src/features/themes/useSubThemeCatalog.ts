import { useCallback, useEffect, useRef, useState } from "react";
import type { DesktopThemeSnapshot } from "../../types/electron";
import {
  createSubThemeCatalogSnapshot,
  getCompatibleSubThemes,
} from "./builtinSubThemes";
import type {
  SubThemeColorMode,
  SubThemeCatalogState,
  SubThemeCatalogSnapshot,
} from "./themeTypes";
import type { InterfaceStyle } from "../appearance/interfaceStyles";

const EMPTY_HOST_SNAPSHOT: DesktopThemeSnapshot = Object.freeze({
  themes: Object.freeze([]),
  diagnostics: Object.freeze([]),
});

export type SubThemeCatalogController = SubThemeCatalogState & Readonly<{
  openDirectory: () => Promise<{ opened: boolean }>;
  createTheme: () => Promise<{ created: boolean; themeId?: string }>;
}>;

export function useSubThemeCatalog(): SubThemeCatalogController {
  const desktopThemes = window.puppyoneDesktop?.themes;
  const refreshGeneration = useRef(0);
  const [state, setState] = useState<SubThemeCatalogState>(() => ({
    snapshot: createSubThemeCatalogSnapshot(EMPTY_HOST_SNAPSHOT),
    status: desktopThemes ? "loading" : "ready",
    error: null,
  }));

  const refresh = useCallback(async () => {
    if (!desktopThemes) return null;
    const generation = refreshGeneration.current + 1;
    refreshGeneration.current = generation;
    try {
      const snapshot = createSubThemeCatalogSnapshot(await desktopThemes.list());
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
        snapshot: createSubThemeCatalogSnapshot(EMPTY_HOST_SNAPSHOT),
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

  const createTheme = useCallback(async () => {
    if (!desktopThemes) return { created: false };
    try {
      const result = await desktopThemes.create();
      await refresh();
      return result;
    } catch (error) {
      setState((current) => ({
        ...current,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      }));
      return { created: false };
    }
  }, [desktopThemes, refresh]);

  return { ...state, openDirectory, createTheme };
}

export function useSubThemeNativeMenu({
  snapshot,
  rootThemeId,
  colorMode,
  selectedSubThemeId,
  onSubThemeChange,
}: {
  snapshot: SubThemeCatalogSnapshot;
  rootThemeId: InterfaceStyle;
  colorMode: SubThemeColorMode;
  selectedSubThemeId: string;
  onSubThemeChange: (subThemeId: string) => void;
}) {
  const desktopThemes = window.puppyoneDesktop?.themes;

  useEffect(() => {
    if (!desktopThemes?.syncNativeMenu) return;
    void desktopThemes.syncNativeMenu({
      pack: selectedSubThemeId,
      themes: getCompatibleSubThemes(snapshot, rootThemeId, colorMode)
        .map(({ id, name, targets }) => ({ id, name, targets })),
    }).catch(() => undefined);
  }, [colorMode, desktopThemes, rootThemeId, selectedSubThemeId, snapshot]);

  useEffect(() => {
    if (!desktopThemes?.onSelectionRequested) return undefined;
    return desktopThemes.onSelectionRequested((request) => {
      if (request.kind === "pack" && request.themeId) onSubThemeChange(request.themeId);
    });
  }, [desktopThemes, onSubThemeChange]);
}
