import { useEffect, useLayoutEffect, useState } from "react";
import type { FileIconThemeId } from "@puppyone/shared-ui";
import { getInterfaceStyleFirstPaint } from "../appearance/interfaceStyles";
import {
  AI_EDIT_ASSIST_STORAGE_KEY,
  DIFF_MARKERS_STORAGE_KEY,
  DOCK_ICON_STORAGE_KEY,
  EXPERIMENTAL_SETTINGS_STORAGE_KEY,
  EXTERNAL_APPS_STORAGE_KEY,
  FILES_VISIBILITY_STORAGE_KEY,
  FILE_ICON_THEME_STORAGE_KEY,
  GIT_DISPLAY_MODE_STORAGE_KEY,
  INTERFACE_STYLE_STORAGE_KEY,
  DARK_THEME_PRESET_STORAGE_KEY,
  LIGHT_THEME_PRESET_STORAGE_KEY,
  LOADING_ANIMATION_CHANGE_EVENT,
  LOADING_ANIMATION_STORAGE_KEY,
  POINTER_CURSORS_STORAGE_KEY,
  RIGHT_SIDEBAR_TOOLS_STORAGE_KEY,
  SIDEBAR_NAVIGATION_LAYOUT_STORAGE_KEY,
  SIDEBAR_NAVIGATION_VISIBILITY_STORAGE_KEY,
  TEXT_SIZE_STORAGE_KEY,
  TYPOGRAPHY_STORAGE_KEY,
  THEME_STORAGE_KEY,
  TITLEBAR_ACTIONS_STORAGE_KEY,
  getSidebarNavigationOrientation,
  getSidebarNavigationPlacement,
  parseLoadingAnimationPreset,
  parseTypography,
  resolveActiveThemeMode,
  type ExternalAppsSettings,
  type DiffMarkers,
  type DockIcon,
  type ExperimentalSettings,
  type FilesVisibilitySettings,
  type GitDisplayMode,
  type InterfaceStyle,
  type LoadingAnimationPreset,
  type RightSidebarToolsSettings,
  type SidebarNavigationLayout,
  type SidebarNavigationVisibilitySettings,
  type ThemeMode,
  type TextSize,
  type TypographyPreferences,
  type TitlebarActionsSettings,
} from "../../preferences";
import {
  AGENT_PREFERRED_RUNTIME_STORAGE_KEY,
  AGENT_PREFERRED_MODEL_STORAGE_KEY,
  EXPLORER_WIDTH_STORAGE_KEY,
  RIGHT_SIDEBAR_WIDTH_STORAGE_KEY,
  RIGHT_SIDEBAR_SURFACE_STORAGE_KEY,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
  readInitialAgentPreferredModel,
  readInitialAgentPreferredRuntime,
  readInitialAiEditAssistEnabled,
  readInitialExperimentalSettings,
  readInitialExplorerWidth,
  readInitialExternalAppsSettings,
  readInitialFileIconTheme,
  readInitialFilesVisibilitySettings,
  readInitialGitDisplayMode,
  readInitialInterfaceStyle,
  readInitialRightSidebarToolsSettings,
  readInitialRightSidebarWidth,
  readInitialRightSidebarSurface,
  readInitialSidebarCollapsed,
  readInitialSidebarNavigationLayout,
  readInitialSidebarNavigationVisibilitySettings,
  readInitialTitlebarActionsSettings,
  readInitialDarkThemePreset,
  readInitialDiffMarkers,
  readInitialDockIcon,
  readInitialLightThemePreset,
  readInitialLoadingAnimationPreset,
  readInitialPointerCursors,
  readInitialTextSize,
  readInitialTypographyPreferences,
  readInitialThemeMode,
  readSystemDarkMode,
} from "./preferences";

export function useDesktopPreferences() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => readInitialThemeMode());
  const [interfaceStyle, setInterfaceStyle] = useState<InterfaceStyle>(() => readInitialInterfaceStyle());
  const [lightThemePreset, setLightThemePreset] = useState(() => readInitialLightThemePreset());
  const [darkThemePreset, setDarkThemePreset] = useState(() => readInitialDarkThemePreset());
  const [textSize, setTextSize] = useState<TextSize>(() => readInitialTextSize());
  const [typographyPreferences, setTypographyPreferences] = useState<TypographyPreferences>(
    () => readInitialTypographyPreferences(),
  );
  const [pointerCursors, setPointerCursors] = useState(() => readInitialPointerCursors());
  const [loadingAnimationPreset, setLoadingAnimationPreset] = useState<LoadingAnimationPreset>(
    () => readInitialLoadingAnimationPreset(),
  );
  const [dockIcon, setDockIcon] = useState<DockIcon>(() => readInitialDockIcon());
  const [diffMarkers, setDiffMarkers] = useState<DiffMarkers>(() => readInitialDiffMarkers());
  const [fileIconTheme, setFileIconTheme] = useState<FileIconThemeId>(() => readInitialFileIconTheme());
  const [sidebarNavigationLayout, setSidebarNavigationLayout] = useState<SidebarNavigationLayout>(() => readInitialSidebarNavigationLayout());
  const [sidebarNavigationVisibilitySettings, setSidebarNavigationVisibilitySettings] = useState<SidebarNavigationVisibilitySettings>(
    () => readInitialSidebarNavigationVisibilitySettings(),
  );
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
  const [agentPreferredRuntime, setAgentPreferredRuntime] = useState<string | null>(() => readInitialAgentPreferredRuntime());
  const [agentPreferredModel, setAgentPreferredModel] = useState<string | null>(() => readInitialAgentPreferredModel());
  const [systemDark, setSystemDark] = useState(() => readSystemDarkMode());
  const activeThemeMode = resolveActiveThemeMode(interfaceStyle, themeMode);
  const resolvedTheme = activeThemeMode === "system" ? (systemDark ? "dark" : "light") : activeThemeMode;

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  useLayoutEffect(() => {
    window.localStorage.setItem(INTERFACE_STYLE_STORAGE_KEY, interfaceStyle);
    const root = document.documentElement;
    const firstPaint = getInterfaceStyleFirstPaint(interfaceStyle, resolvedTheme);
    root.dataset.interfaceStyle = interfaceStyle;
    root.dataset.initialTheme = resolvedTheme;
    root.style.setProperty("--initial-shell-background", firstPaint.background);
    root.style.setProperty("--initial-shell-color-scheme", firstPaint.colorScheme);
  }, [interfaceStyle, resolvedTheme]);

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
    window.localStorage.setItem(TYPOGRAPHY_STORAGE_KEY, JSON.stringify(typographyPreferences));
  }, [typographyPreferences]);

  useEffect(() => {
    const syncTypographyAcrossWindows = (event: StorageEvent) => {
      if (event.key !== TYPOGRAPHY_STORAGE_KEY && event.key !== null) return;
      setTypographyPreferences(parseTypography(event.key === null ? null : event.newValue));
    };
    window.addEventListener("storage", syncTypographyAcrossWindows);
    return () => window.removeEventListener("storage", syncTypographyAcrossWindows);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(POINTER_CURSORS_STORAGE_KEY, pointerCursors ? "true" : "false");
  }, [pointerCursors]);

  useEffect(() => {
    window.localStorage.setItem(LOADING_ANIMATION_STORAGE_KEY, loadingAnimationPreset);
    window.dispatchEvent(new Event(LOADING_ANIMATION_CHANGE_EVENT));
  }, [loadingAnimationPreset]);

  useEffect(() => {
    const syncLoadingAnimationAcrossWindows = (event: StorageEvent) => {
      if (event.key !== LOADING_ANIMATION_STORAGE_KEY && event.key !== null) return;
      setLoadingAnimationPreset(parseLoadingAnimationPreset(event.key === null ? null : event.newValue));
    };
    window.addEventListener("storage", syncLoadingAnimationAcrossWindows);
    return () => window.removeEventListener("storage", syncLoadingAnimationAcrossWindows);
  }, []);

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
    window.localStorage.setItem(
      SIDEBAR_NAVIGATION_VISIBILITY_STORAGE_KEY,
      JSON.stringify(sidebarNavigationVisibilitySettings),
    );
  }, [sidebarNavigationVisibilitySettings]);

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
    if (agentPreferredRuntime) window.localStorage.setItem(AGENT_PREFERRED_RUNTIME_STORAGE_KEY, agentPreferredRuntime);
    else window.localStorage.removeItem(AGENT_PREFERRED_RUNTIME_STORAGE_KEY);
  }, [agentPreferredRuntime]);

  useEffect(() => {
    if (agentPreferredModel) window.localStorage.setItem(AGENT_PREFERRED_MODEL_STORAGE_KEY, agentPreferredModel);
    else window.localStorage.removeItem(AGENT_PREFERRED_MODEL_STORAGE_KEY);
  }, [agentPreferredModel]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setSystemDark(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const sidebarNavigationPlacement = getSidebarNavigationPlacement(sidebarNavigationLayout);
  const sidebarNavigationOrientation = getSidebarNavigationOrientation(sidebarNavigationLayout);
  const terminalToolEnabled = rightSidebarToolsSettings.enabled.terminal;

  return {
    aiEditAssistEnabled,
    activeThemeMode,
    diffMarkers,
    dockIcon,
    explorerWidth,
    externalAppsSettings,
    experimentalSettings,
    fileIconTheme,
    filesVisibilitySettings,
    gitDisplayMode,
    interfaceStyle,
    resolvedTheme,
    rightSidebarOpen,
    rightSidebarToolsSettings,
    rightSidebarWidth,
    rightSidebarSurface,
    agentPreferredRuntime,
    agentPreferredModel,
    sidebarCollapsed,
    sidebarNavigationLayout,
    sidebarNavigationOrientation,
    sidebarNavigationPlacement,
    sidebarNavigationVisibilitySettings,
    terminalToolEnabled,
    titlebarActionsSettings,
    darkThemePreset,
    lightThemePreset,
    loadingAnimationPreset,
    themeMode,
    textSize,
    typographyPreferences,
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
    setInterfaceStyle,
    setRightSidebarOpen,
    setRightSidebarToolsSettings,
    setRightSidebarWidth,
    setRightSidebarSurface,
    setAgentPreferredRuntime,
    setAgentPreferredModel,
    setSidebarCollapsed,
    setSidebarNavigationLayout,
    setSidebarNavigationVisibilitySettings,
    setTitlebarActionsSettings,
    setLightThemePreset,
    setLoadingAnimationPreset,
    setPointerCursors,
    setTextSize,
    setThemeMode,
    setTypographyPreferences,
  };
}

export type DesktopPreferencesController = ReturnType<typeof useDesktopPreferences>;
