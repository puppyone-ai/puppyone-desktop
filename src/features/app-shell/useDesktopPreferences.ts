import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { FileIconThemeId } from "@puppyone/shared-ui";
import {
  getInterfaceStyleFirstPaint,
  supportsThemePreset,
} from "../appearance/interfaceStyles";
import {
  APPEARANCE_PREFERENCES_STORAGE_KEY,
  createAppearancePreferencesV2,
  readAppearancePreferences,
  serializeAppearancePreferences,
} from "../appearance/appearancePreferences";
import { resolveAppearance } from "../appearance/resolveAppearance";
import {
  AI_EDIT_ASSIST_STORAGE_KEY,
  AGENT_FILE_ACTIVITY_INDICATORS_STORAGE_KEY,
  CREATE_NEW_MENU_STORAGE_KEY,
  DIFF_MARKERS_STORAGE_KEY,
  MARKDOWN_PRESENTATION_STORAGE_KEY,
  EXPERIMENTAL_SETTINGS_STORAGE_KEY,
  FILES_VISIBILITY_STORAGE_KEY,
  FILE_ICON_THEME_STORAGE_KEY,
  GIT_DISPLAY_MODE_STORAGE_KEY,
  GIT_SIDEBAR_LAYOUT_STORAGE_KEY,
  INTERFACE_STYLE_STORAGE_KEY,
  DARK_THEME_PRESET_STORAGE_KEY,
  LIGHT_THEME_PRESET_STORAGE_KEY,
  LOADING_ANIMATION_CHANGE_EVENT,
  LOADING_ANIMATION_STORAGE_KEY,
  LOCAL_AGENTS_STORAGE_KEY,
  POINTER_CURSORS_STORAGE_KEY,
  RIGHT_SIDEBAR_TOOLS_STORAGE_KEY,
  SIDEBAR_NAVIGATION_LAYOUT_STORAGE_KEY,
  SIDEBAR_NAVIGATION_VISIBILITY_STORAGE_KEY,
  TEXT_SIZE_STORAGE_KEY,
  TYPOGRAPHY_STORAGE_KEY,
  THEME_STORAGE_KEY,
  TITLEBAR_ACTIONS_STORAGE_KEY,
  parseLoadingAnimationPreset,
  parseCreateNewMenuSettings,
  parseTypography,
  type CreateNewMenuSettings,
  type DiffMarkers,
  type ExperimentalSettings,
  type FilesVisibilitySettings,
  type GitDisplayMode,
  type GitSidebarLayout,
  type InterfaceStyle,
  type LoadingAnimationPreset,
  type LocalAgentsSettings,
  type RightSidebarToolsSettings,
  type SidebarNavigationLayout,
  type SidebarNavigationVisibilitySettings,
  type ThemeMode,
  type TextSize,
  type TypographyPreferences,
  type TitlebarActionsSettings,
} from "../../preferences";
import {
  serializeMarkdownPresentationSettings,
  type MarkdownPresentationSettings,
} from "../markdown/markdownPresentation";
import {
  AGENT_ROUTING_PREFERENCES_STORAGE_KEY,
  AGENT_PREFERRED_RUNTIME_STORAGE_KEY,
  AGENT_PREFERRED_MODEL_STORAGE_KEY,
  EXPLORER_WIDTH_STORAGE_KEY,
  RIGHT_SIDEBAR_WIDTH_STORAGE_KEY,
  RIGHT_SIDEBAR_SURFACE_STORAGE_KEY,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
  readInitialAgentPreferredModel,
  readInitialAgentPreferredRuntime,
  readInitialAgentFileActivityIndicatorsEnabled,
  readInitialAiEditAssistEnabled,
  readInitialCreateNewMenuSettings,
  readInitialExperimentalSettings,
  readInitialExplorerWidth,
  readInitialFileIconTheme,
  readInitialFilesVisibilitySettings,
  readInitialGitDisplayMode,
  readInitialGitSidebarLayout,
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
  readInitialMarkdownPresentationSettings,
  readInitialLightThemePreset,
  readInitialLoadingAnimationPreset,
  readInitialLocalAgentsSettings,
  readInitialPointerCursors,
  readInitialTextSize,
  readInitialTypographyPreferences,
  readInitialThemeMode,
  readSystemDarkMode,
} from "./preferences";
import {
  parseAgentRoutingPreferences,
  selectAgentRuntime,
  serializeAgentRoutingPreferences,
  updateAgentRoutePreference,
  type AgentRoutePreference,
} from "./agentRoutingPreferences";

export function useDesktopPreferences() {
  const [initialAppearanceRead] = useState(() => readAppearancePreferences(
    window.localStorage.getItem(APPEARANCE_PREFERENCES_STORAGE_KEY),
    {
      activeStyle: readInitialInterfaceStyle(),
      themeMode: readInitialThemeMode(),
      lightThemePreset: readInitialLightThemePreset(),
      darkThemePreset: readInitialDarkThemePreset(),
      textSize: readInitialTextSize(),
      typography: readInitialTypographyPreferences(),
      pointerCursors: readInitialPointerCursors(),
      loadingAnimationPreset: readInitialLoadingAnimationPreset(),
      fileIconTheme: readInitialFileIconTheme(),
      sidebarNavigationLayout: readInitialSidebarNavigationLayout(),
    },
  ));
  const initialAppearance = initialAppearanceRead.preferences;
  const [themeMode, setThemeMode] = useState<ThemeMode>(initialAppearance.shared.themeMode);
  const [interfaceStyle, setInterfaceStyle] = useState<InterfaceStyle>(initialAppearance.activeStyle);
  const [lightThemePreset, setLightThemePreset] = useState(initialAppearance.shared.lightThemePreset);
  const [darkThemePreset, setDarkThemePreset] = useState(initialAppearance.shared.darkThemePreset);
  const [textSize, setTextSize] = useState<TextSize>(initialAppearance.shared.textSize);
  const [typographyPreferences, setTypographyPreferences] = useState<TypographyPreferences>(
    initialAppearance.shared.typography,
  );
  const [pointerCursors, setPointerCursors] = useState(initialAppearance.shared.pointerCursors);
  const [loadingAnimationPreset, setLoadingAnimationPreset] = useState<LoadingAnimationPreset>(
    initialAppearance.shared.loadingAnimationPreset,
  );
  const [diffMarkers, setDiffMarkers] = useState<DiffMarkers>(() => readInitialDiffMarkers());
  const [markdownPresentation, setMarkdownPresentation] = useState<MarkdownPresentationSettings>(
    () => readInitialMarkdownPresentationSettings(),
  );
  const [fileIconTheme, setFileIconTheme] = useState<FileIconThemeId>(initialAppearance.shared.fileIconTheme);
  const [sidebarNavigationLayout, setSidebarNavigationLayout] = useState<SidebarNavigationLayout>(
    initialAppearance.shared.sidebarNavigationLayout,
  );
  const [sidebarNavigationVisibilitySettings, setSidebarNavigationVisibilitySettings] = useState<SidebarNavigationVisibilitySettings>(
    () => readInitialSidebarNavigationVisibilitySettings(),
  );
  const [gitDisplayMode, setGitDisplayMode] = useState<GitDisplayMode>(() => readInitialGitDisplayMode());
  const [gitSidebarLayout, setGitSidebarLayout] = useState<GitSidebarLayout>(() => readInitialGitSidebarLayout());
  const [filesVisibilitySettings, setFilesVisibilitySettings] = useState<FilesVisibilitySettings>(() => readInitialFilesVisibilitySettings());
  const [createNewMenuSettings, setCreateNewMenuSettings] = useState<CreateNewMenuSettings>(
    () => readInitialCreateNewMenuSettings(),
  );
  const [experimentalSettings, setExperimentalSettings] = useState<ExperimentalSettings>(() => readInitialExperimentalSettings());
  const [rightSidebarToolsSettings, setRightSidebarToolsSettings] = useState<RightSidebarToolsSettings>(() => readInitialRightSidebarToolsSettings());
  const [titlebarActionsSettings, setTitlebarActionsSettings] = useState<TitlebarActionsSettings>(() => readInitialTitlebarActionsSettings());
  const [localAgentsSettings, setLocalAgentsSettings] = useState<LocalAgentsSettings>(
    () => readInitialLocalAgentsSettings(),
  );
  const [agentFileActivityIndicatorsEnabled, setAgentFileActivityIndicatorsEnabled] = useState(
    () => readInitialAgentFileActivityIndicatorsEnabled(),
  );
  const [aiEditAssistEnabled, setAiEditAssistEnabled] = useState(() => readInitialAiEditAssistEnabled());
  const [explorerWidth, setExplorerWidth] = useState(() => readInitialExplorerWidth());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readInitialSidebarCollapsed());
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [rightSidebarWidth, setRightSidebarWidth] = useState(() => readInitialRightSidebarWidth());
  const [rightSidebarSurface, setRightSidebarSurface] = useState(() => readInitialRightSidebarSurface());
  const [agentRoutingPreferences, setAgentRoutingPreferences] = useState(() => (
    parseAgentRoutingPreferences(
      window.localStorage.getItem(AGENT_ROUTING_PREFERENCES_STORAGE_KEY),
      {
        legacyRuntimeId: readInitialAgentPreferredRuntime(),
        legacyModelId: readInitialAgentPreferredModel(),
      },
    )
  ));
  const agentPreferredRuntime = agentRoutingPreferences.selectedRuntimeId;
  const agentPreferredRoute = agentPreferredRuntime
    ? agentRoutingPreferences.routes[agentPreferredRuntime] ?? {}
    : {};
  const agentPreferredModel = agentPreferredRoute.modelId ?? null;
  const setAgentPreferredRuntime = useCallback((runtimeId: string | null) => {
    setAgentRoutingPreferences((current) => selectAgentRuntime(current, runtimeId));
  }, []);
  const setAgentPreferredRoute = useCallback((patch: Partial<AgentRoutePreference>) => {
    setAgentRoutingPreferences((current) => (
      current.selectedRuntimeId
        ? updateAgentRoutePreference(current, current.selectedRuntimeId, patch)
        : current
    ));
  }, []);
  const setAgentPreferredModel = useCallback((modelId: string | null) => {
    setAgentPreferredRoute({ modelId: modelId ?? undefined });
  }, [setAgentPreferredRoute]);
  const [systemDark, setSystemDark] = useState(() => readSystemDarkMode());
  const resolvedAppearance = useMemo(() => resolveAppearance({
    interfaceStyle,
    themeMode,
    sidebarNavigationLayout,
    textSize,
    fileIconTheme,
  }), [fileIconTheme, interfaceStyle, sidebarNavigationLayout, textSize, themeMode]);
  const activeThemeMode = resolvedAppearance.themeMode;
  const resolvedTheme = activeThemeMode === "system" ? (systemDark ? "dark" : "light") : activeThemeMode;
  const activeThemePreset = resolvedTheme === "light" ? lightThemePreset : darkThemePreset;

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  useLayoutEffect(() => {
    window.localStorage.setItem(INTERFACE_STYLE_STORAGE_KEY, interfaceStyle);
    const root = document.documentElement;
    const firstPaint = getInterfaceStyleFirstPaint(interfaceStyle, resolvedTheme, activeThemePreset);
    root.dataset.interfaceStyle = interfaceStyle;
    root.dataset.interfaceStyleFamily = resolvedAppearance.profile.family;
    root.dataset.interfaceStyleVariant = resolvedAppearance.profile.variant;
    root.dataset.interfaceStylePalette = resolvedAppearance.profile.palette;
    root.dataset.appearanceTokenSet = resolvedAppearance.tokenSet;
    root.dataset.shellComposition = resolvedAppearance.composition.shell;
    root.dataset.titlebarComposition = resolvedAppearance.composition.titlebar;
    root.dataset.navigationComposition = resolvedAppearance.composition.navigation;
    root.dataset.locationBarComposition = resolvedAppearance.composition.locationBar;
    root.dataset.scrollbarComposition = resolvedAppearance.composition.scrollbar;
    root.dataset.iconPack = resolvedAppearance.composition.iconPack;
    root.dataset.initialTheme = resolvedTheme;
    if (supportsThemePreset(interfaceStyle, resolvedTheme)) {
      root.dataset.initialThemePreset = activeThemePreset;
    } else {
      delete root.dataset.initialThemePreset;
    }
    root.style.setProperty("--initial-shell-background", firstPaint.background);
    root.style.setProperty("--initial-shell-color-scheme", firstPaint.colorScheme);
    window.puppyoneDesktop?.setWindowBackground?.({
      background: firstPaint.background,
      themeSource: activeThemeMode === "system" ? "system" : firstPaint.colorScheme,
    });
    void window.puppyoneDesktop?.setWindowChromeProfile?.({
      titlebar: resolvedAppearance.composition.titlebar,
    }).catch(() => undefined);
  }, [activeThemeMode, activeThemePreset, interfaceStyle, resolvedAppearance, resolvedTheme]);

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
    window.localStorage.setItem(DIFF_MARKERS_STORAGE_KEY, diffMarkers);
  }, [diffMarkers]);

  useEffect(() => {
    window.localStorage.setItem(
      MARKDOWN_PRESENTATION_STORAGE_KEY,
      serializeMarkdownPresentationSettings(markdownPresentation),
    );
  }, [markdownPresentation]);

  useEffect(() => {
    window.localStorage.setItem(FILE_ICON_THEME_STORAGE_KEY, fileIconTheme);
  }, [fileIconTheme]);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_NAVIGATION_LAYOUT_STORAGE_KEY, sidebarNavigationLayout);
  }, [sidebarNavigationLayout]);

  useEffect(() => {
    if (!initialAppearanceRead.writable) return;
    const preferences = createAppearancePreferencesV2({
      activeStyle: interfaceStyle,
      shared: {
        themeMode,
        lightThemePreset,
        darkThemePreset,
        textSize,
        typography: typographyPreferences,
        pointerCursors,
        loadingAnimationPreset,
        fileIconTheme,
        sidebarNavigationLayout,
      },
      byStyle: initialAppearance.byStyle,
      bySurface: initialAppearance.bySurface,
      byStyleSurface: initialAppearance.byStyleSurface,
    });
    window.localStorage.setItem(
      APPEARANCE_PREFERENCES_STORAGE_KEY,
      serializeAppearancePreferences(preferences),
    );
  }, [
    darkThemePreset,
    fileIconTheme,
    initialAppearance,
    initialAppearanceRead.writable,
    interfaceStyle,
    lightThemePreset,
    loadingAnimationPreset,
    pointerCursors,
    sidebarNavigationLayout,
    textSize,
    themeMode,
    typographyPreferences,
  ]);

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
    window.localStorage.setItem(GIT_SIDEBAR_LAYOUT_STORAGE_KEY, gitSidebarLayout);
  }, [gitSidebarLayout]);

  useEffect(() => {
    window.localStorage.setItem(FILES_VISIBILITY_STORAGE_KEY, JSON.stringify(filesVisibilitySettings));
  }, [filesVisibilitySettings]);

  useEffect(() => {
    // Retired per-file-type overrides must not continue to shadow the system
    // default after the setting has been removed.
    window.localStorage.removeItem("puppyone.desktop.externalApps");
  }, []);

  useEffect(() => {
    window.localStorage.setItem(CREATE_NEW_MENU_STORAGE_KEY, JSON.stringify(createNewMenuSettings));
  }, [createNewMenuSettings]);

  useEffect(() => {
    const syncCreateNewMenuSettings = (event: StorageEvent) => {
      if (event.key !== CREATE_NEW_MENU_STORAGE_KEY && event.key !== null) return;
      setCreateNewMenuSettings(parseCreateNewMenuSettings(event.key === null ? null : event.newValue));
    };
    window.addEventListener("storage", syncCreateNewMenuSettings);
    return () => window.removeEventListener("storage", syncCreateNewMenuSettings);
  }, []);

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
    window.localStorage.setItem(LOCAL_AGENTS_STORAGE_KEY, JSON.stringify(localAgentsSettings));
  }, [localAgentsSettings]);

  useLayoutEffect(() => {
    window.localStorage.setItem(
      AGENT_FILE_ACTIVITY_INDICATORS_STORAGE_KEY,
      agentFileActivityIndicatorsEnabled ? "true" : "false",
    );
    document.documentElement.dataset.agentFileActivity = agentFileActivityIndicatorsEnabled
      ? "visible"
      : "hidden";
  }, [agentFileActivityIndicatorsEnabled]);

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
    window.localStorage.setItem(
      AGENT_ROUTING_PREFERENCES_STORAGE_KEY,
      serializeAgentRoutingPreferences(agentRoutingPreferences),
    );
    window.localStorage.removeItem(AGENT_PREFERRED_RUNTIME_STORAGE_KEY);
    window.localStorage.removeItem(AGENT_PREFERRED_MODEL_STORAGE_KEY);
  }, [agentRoutingPreferences]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setSystemDark(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const sidebarNavigationPlacement = resolvedAppearance.sidebarNavigationPlacement;
  const sidebarNavigationOrientation = resolvedAppearance.sidebarNavigationOrientation;
  const terminalToolEnabled = rightSidebarToolsSettings.enabled.terminal;

  return {
    aiEditAssistEnabled,
    activeThemeMode,
    diffMarkers,
    markdownPresentation,
    explorerWidth,
    createNewMenuSettings,
    experimentalSettings,
    fileIconTheme: resolvedAppearance.fileIconTheme,
    filesVisibilitySettings,
    gitDisplayMode,
    gitSidebarLayout,
    interfaceStyle,
    resolvedAppearance,
    resolvedTheme,
    rightSidebarOpen,
    rightSidebarToolsSettings,
    rightSidebarWidth,
    rightSidebarSurface,
    agentPreferredRuntime,
    agentPreferredRoute,
    agentPreferredModel,
    agentRoutingPreferences,
    agentFileActivityIndicatorsEnabled,
    sidebarCollapsed,
    sidebarNavigationLayout,
    effectiveSidebarNavigationLayout: resolvedAppearance.sidebarNavigationLayout,
    sidebarNavigationOrientation,
    sidebarNavigationPlacement,
    sidebarNavigationVisibilitySettings,
    terminalToolEnabled,
    titlebarActionsSettings,
    darkThemePreset,
    lightThemePreset,
    loadingAnimationPreset,
    localAgentsSettings,
    themeMode,
    textSize: resolvedAppearance.textSize,
    typographyPreferences,
    pointerCursors,
    setAiEditAssistEnabled,
    setDarkThemePreset,
    setDiffMarkers,
    setMarkdownPresentation,
    setExplorerWidth,
    setCreateNewMenuSettings,
    setExperimentalSettings,
    setFileIconTheme,
    setFilesVisibilitySettings,
    setGitDisplayMode,
    setGitSidebarLayout,
    setInterfaceStyle,
    setRightSidebarOpen,
    setRightSidebarToolsSettings,
    setRightSidebarWidth,
    setRightSidebarSurface,
    setAgentPreferredRuntime,
    setAgentPreferredRoute,
    setAgentPreferredModel,
    setAgentFileActivityIndicatorsEnabled,
    setSidebarCollapsed,
    setSidebarNavigationLayout,
    setSidebarNavigationVisibilitySettings,
    setTitlebarActionsSettings,
    setLightThemePreset,
    setLoadingAnimationPreset,
    setLocalAgentsSettings,
    setPointerCursors,
    setTextSize,
    setThemeMode,
    setTypographyPreferences,
  };
}

export type DesktopPreferencesController = ReturnType<typeof useDesktopPreferences>;
