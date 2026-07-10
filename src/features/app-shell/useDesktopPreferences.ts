import { useEffect, useState } from "react";
import type { FileIconThemeId } from "@puppyone/shared-ui";
import {
  AI_EDIT_ASSIST_STORAGE_KEY,
  DIFF_MARKERS_STORAGE_KEY,
  DOCK_ICON_STORAGE_KEY,
  EXPERIMENTAL_SETTINGS_STORAGE_KEY,
  EXTERNAL_APPS_STORAGE_KEY,
  FILES_VISIBILITY_STORAGE_KEY,
  FILE_ICON_THEME_STORAGE_KEY,
  GIT_DISPLAY_MODE_STORAGE_KEY,
  DARK_THEME_PRESET_STORAGE_KEY,
  LIGHT_THEME_PRESET_STORAGE_KEY,
  POINTER_CURSORS_STORAGE_KEY,
  RIGHT_SIDEBAR_TOOLS_STORAGE_KEY,
  SIDEBAR_NAVIGATION_LAYOUT_STORAGE_KEY,
  TEXT_SIZE_STORAGE_KEY,
  THEME_STORAGE_KEY,
  TITLEBAR_ACTIONS_STORAGE_KEY,
  getSidebarNavigationOrientation,
  getSidebarNavigationPlacement,
  type ExternalAppsSettings,
  type DiffMarkers,
  type DockIcon,
  type ExperimentalSettings,
  type FilesVisibilitySettings,
  type GitDisplayMode,
  type RightSidebarToolsSettings,
  type SidebarNavigationLayout,
  type ThemeMode,
  type TextSize,
  type TitlebarActionsSettings,
} from "../../preferences";
import {
  EXPLORER_WIDTH_STORAGE_KEY,
  RIGHT_SIDEBAR_WIDTH_STORAGE_KEY,
  RIGHT_SIDEBAR_SURFACE_STORAGE_KEY,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
  readInitialAiEditAssistEnabled,
  readInitialExperimentalSettings,
  readInitialExplorerWidth,
  readInitialExternalAppsSettings,
  readInitialFileIconTheme,
  readInitialFilesVisibilitySettings,
  readInitialGitDisplayMode,
  readInitialRightSidebarToolsSettings,
  readInitialRightSidebarWidth,
  readInitialRightSidebarSurface,
  readInitialSidebarCollapsed,
  readInitialSidebarNavigationLayout,
  readInitialTitlebarActionsSettings,
  readInitialDarkThemePreset,
  readInitialDiffMarkers,
  readInitialDockIcon,
  readInitialLightThemePreset,
  readInitialPointerCursors,
  readInitialTextSize,
  readInitialThemeMode,
  readSystemDarkMode,
} from "./preferences";

export function useDesktopPreferences() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => readInitialThemeMode());
  const [lightThemePreset, setLightThemePreset] = useState(() => readInitialLightThemePreset());
  const [darkThemePreset, setDarkThemePreset] = useState(() => readInitialDarkThemePreset());
  const [textSize, setTextSize] = useState<TextSize>(() => readInitialTextSize());
  const [pointerCursors, setPointerCursors] = useState(() => readInitialPointerCursors());
  const [dockIcon, setDockIcon] = useState<DockIcon>(() => readInitialDockIcon());
  const [diffMarkers, setDiffMarkers] = useState<DiffMarkers>(() => readInitialDiffMarkers());
  const [fileIconTheme, setFileIconTheme] = useState<FileIconThemeId>(() => readInitialFileIconTheme());
  const [sidebarNavigationLayout, setSidebarNavigationLayout] = useState<SidebarNavigationLayout>(() => readInitialSidebarNavigationLayout());
  const [gitDisplayMode, setGitDisplayMode] = useState<GitDisplayMode>(() => readInitialGitDisplayMode());
  const [filesVisibilitySettings, setFilesVisibilitySettings] = useState<FilesVisibilitySettings>(() => readInitialFilesVisibilitySettings());
  const [externalAppsSettings, setExternalAppsSettings] = useState<ExternalAppsSettings>(() => readInitialExternalAppsSettings());
  const [experimentalSettings, setExperimentalSettings] = useState<ExperimentalSettings>(() => readInitialExperimentalSettings());
  const [rightSidebarToolsSettings, setRightSidebarToolsSettings] = useState<RightSidebarToolsSettings>(() => readInitialRightSidebarToolsSettings());
  const [titlebarActionsSettings, setTitlebarActionsSettings] = useState<TitlebarActionsSettings>(() => readInitialTitlebarActionsSettings());
  const [aiEditAssistEnabled, setAiEditAssistEnabled] = useState(() => readInitialAiEditAssistEnabled());
  const [explorerWidth, setExplorerWidth] = useState(() => readInitialExplorerWidth());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readInitialSidebarCollapsed());
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [rightSidebarWidth, setRightSidebarWidth] = useState(() => readInitialRightSidebarWidth());
  const [rightSidebarSurface, setRightSidebarSurface] = useState(() => readInitialRightSidebarSurface());
  const [systemDark, setSystemDark] = useState(() => readSystemDarkMode());

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  useEffect(() => {
    window.localStorage.setItem(LIGHT_THEME_PRESET_STORAGE_KEY, lightThemePreset);
  }, [lightThemePreset]);

  useEffect(() => {
    window.localStorage.setItem(DARK_THEME_PRESET_STORAGE_KEY, darkThemePreset);
  }, [darkThemePreset]);

  useEffect(() => {
    window.localStorage.setItem(TEXT_SIZE_STORAGE_KEY, textSize);
  }, [textSize]);

  useEffect(() => {
    window.localStorage.setItem(POINTER_CURSORS_STORAGE_KEY, pointerCursors ? "true" : "false");
  }, [pointerCursors]);

  useEffect(() => {
    window.localStorage.setItem(DOCK_ICON_STORAGE_KEY, dockIcon);
    void window.puppyoneDesktop?.setDockIcon?.(dockIcon).catch(() => undefined);
  }, [dockIcon]);

  useEffect(() => {
    window.localStorage.setItem(DIFF_MARKERS_STORAGE_KEY, diffMarkers);
  }, [diffMarkers]);

  useEffect(() => {
    window.localStorage.setItem(FILE_ICON_THEME_STORAGE_KEY, fileIconTheme);
  }, [fileIconTheme]);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_NAVIGATION_LAYOUT_STORAGE_KEY, sidebarNavigationLayout);
  }, [sidebarNavigationLayout]);

  useEffect(() => {
    window.localStorage.setItem(GIT_DISPLAY_MODE_STORAGE_KEY, gitDisplayMode);
  }, [gitDisplayMode]);

  useEffect(() => {
    window.localStorage.setItem(FILES_VISIBILITY_STORAGE_KEY, JSON.stringify(filesVisibilitySettings));
  }, [filesVisibilitySettings]);

  useEffect(() => {
    window.localStorage.setItem(EXTERNAL_APPS_STORAGE_KEY, JSON.stringify(externalAppsSettings));
  }, [externalAppsSettings]);

  useEffect(() => {
    window.localStorage.setItem(EXPERIMENTAL_SETTINGS_STORAGE_KEY, JSON.stringify(experimentalSettings));
  }, [experimentalSettings]);

  useEffect(() => {
    window.localStorage.setItem(RIGHT_SIDEBAR_TOOLS_STORAGE_KEY, JSON.stringify(rightSidebarToolsSettings));
  }, [rightSidebarToolsSettings]);

  useEffect(() => {
    window.localStorage.setItem(TITLEBAR_ACTIONS_STORAGE_KEY, JSON.stringify(titlebarActionsSettings));
  }, [titlebarActionsSettings]);

  useEffect(() => {
    window.localStorage.setItem(AI_EDIT_ASSIST_STORAGE_KEY, aiEditAssistEnabled ? "true" : "false");
  }, [aiEditAssistEnabled]);

  useEffect(() => {
    window.localStorage.setItem(EXPLORER_WIDTH_STORAGE_KEY, String(explorerWidth));
  }, [explorerWidth]);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, sidebarCollapsed ? "true" : "false");
  }, [sidebarCollapsed]);

  useEffect(() => {
    window.localStorage.setItem(RIGHT_SIDEBAR_WIDTH_STORAGE_KEY, String(rightSidebarWidth));
  }, [rightSidebarWidth]);

  useEffect(() => {
    window.localStorage.setItem(RIGHT_SIDEBAR_SURFACE_STORAGE_KEY, rightSidebarSurface);
  }, [rightSidebarSurface]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setSystemDark(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const resolvedTheme = themeMode === "system" ? (systemDark ? "dark" : "light") : themeMode;
  const sidebarNavigationPlacement = getSidebarNavigationPlacement(sidebarNavigationLayout);
  const sidebarNavigationOrientation = getSidebarNavigationOrientation(sidebarNavigationLayout);
  const terminalToolEnabled = rightSidebarToolsSettings.enabled.terminal;
  const terminalSidebarOpen = terminalToolEnabled && rightSidebarOpen;

  useEffect(() => {
    if (!terminalToolEnabled && rightSidebarOpen) setRightSidebarOpen(false);
  }, [rightSidebarOpen, terminalToolEnabled]);

  return {
    aiEditAssistEnabled,
    diffMarkers,
    dockIcon,
    explorerWidth,
    externalAppsSettings,
    experimentalSettings,
    fileIconTheme,
    filesVisibilitySettings,
    gitDisplayMode,
    resolvedTheme,
    rightSidebarOpen,
    rightSidebarToolsSettings,
    rightSidebarWidth,
    rightSidebarSurface,
    sidebarCollapsed,
    sidebarNavigationLayout,
    sidebarNavigationOrientation,
    sidebarNavigationPlacement,
    terminalSidebarOpen,
    terminalToolEnabled,
    titlebarActionsSettings,
    darkThemePreset,
    lightThemePreset,
    themeMode,
    textSize,
    pointerCursors,
    setAiEditAssistEnabled,
    setDarkThemePreset,
    setDiffMarkers,
    setDockIcon,
    setExplorerWidth,
    setExternalAppsSettings,
    setExperimentalSettings,
    setFileIconTheme,
    setFilesVisibilitySettings,
    setGitDisplayMode,
    setRightSidebarOpen,
    setRightSidebarToolsSettings,
    setRightSidebarWidth,
    setRightSidebarSurface,
    setSidebarCollapsed,
    setSidebarNavigationLayout,
    setTitlebarActionsSettings,
    setLightThemePreset,
    setPointerCursors,
    setTextSize,
    setThemeMode,
  };
}

export type DesktopPreferencesController = ReturnType<typeof useDesktopPreferences>;
