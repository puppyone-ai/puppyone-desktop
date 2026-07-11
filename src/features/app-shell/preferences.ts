import { isFileIconThemeId, type FileIconThemeId } from "@puppyone/shared-ui";
import type { PuppyoneWorkspaceConfig } from "../../types/electron";
import {
  AI_EDIT_ASSIST_STORAGE_KEY,
  DIFF_MARKERS_STORAGE_KEY,
  DOCK_ICON_STORAGE_KEY,
  DEFAULT_SIDEBAR_NAVIGATION_LAYOUT,
  DEFAULT_THEME_MODE,
  EXPERIMENTAL_SETTINGS_STORAGE_KEY,
  EXTERNAL_APPS_STORAGE_KEY,
  FILES_VISIBILITY_STORAGE_KEY,
  FILE_ICON_THEME_STORAGE_KEY,
  GIT_DISPLAY_MODE_STORAGE_KEY,
  DARK_THEME_PRESET_STORAGE_KEY,
  LEGACY_THEME_PRESET_STORAGE_KEY,
  LIGHT_THEME_PRESET_STORAGE_KEY,
  POINTER_CURSORS_STORAGE_KEY,
  RIGHT_SIDEBAR_TOOLS_STORAGE_KEY,
  SIDEBAR_NAVIGATION_LAYOUT_STORAGE_KEY,
  SIDEBAR_NAVIGATION_VISIBILITY_STORAGE_KEY,
  TEXT_SIZE_STORAGE_KEY,
  THEME_STORAGE_KEY,
  TITLEBAR_ACTIONS_STORAGE_KEY,
  parseAiEditAssistEnabled,
  parseDarkThemePreset,
  parseDiffMarkers,
  parseDockIcon,
  parseExperimentalSettings,
  parseExternalAppsSettings,
  parseFilesVisibilitySettings,
  parseGitDisplayMode,
  parseLightThemePreset,
  parsePointerCursors,
  parseRightSidebarToolsSettings,
  parseSidebarNavigationLayout,
  parseSidebarNavigationVisibilitySettings,
  parseThemeMode,
  parseTextSize,
  parseTitlebarActionsSettings,
  type DarkThemePreset,
  type DiffMarkers,
  type DockIcon,
  type ExperimentalSettings,
  type ExternalAppsSettings,
  type FilesVisibilitySettings,
  type GitDisplayMode,
  type LightThemePreset,
  type RightSidebarToolsSettings,
  type SidebarNavigationLayout,
  type SidebarNavigationVisibilitySettings,
  type ThemeMode,
  type TextSize,
  type TitlebarActionsSettings,
} from "../../preferences";

export const EXPLORER_WIDTH_STORAGE_KEY = "puppyone.desktop.explorerWidth";
export const SIDEBAR_COLLAPSED_STORAGE_KEY = "puppyone.desktop.sidebarCollapsed";
export const RIGHT_SIDEBAR_WIDTH_STORAGE_KEY = "puppyone.desktop.rightSidebarWidth";
export const RIGHT_SIDEBAR_SURFACE_STORAGE_KEY = "puppyone.desktop.rightSidebarSurface";
export const AGENT_PREFERRED_MODEL_STORAGE_KEY = "puppyone.desktop.agentPreferredModel";
export type RightSidebarSurface = "chat" | "terminal";
export const DEFAULT_EXPLORER_WIDTH = 320;
export const MIN_EXPLORER_WIDTH = 240;
export const MAX_EXPLORER_WIDTH = 520;
export const COLLAPSED_EXPLORER_WIDTH = 0;
export const DEFAULT_RIGHT_SIDEBAR_WIDTH = 560;
export const MIN_RIGHT_SIDEBAR_WIDTH = 420;
export const MAX_RIGHT_SIDEBAR_WIDTH = 760;

export function readInitialThemeMode(): ThemeMode {
  if (typeof window === "undefined") return DEFAULT_THEME_MODE;
  return parseThemeMode(window.localStorage.getItem(THEME_STORAGE_KEY));
}

export function readInitialLightThemePreset(): LightThemePreset {
  if (typeof window === "undefined") return parseLightThemePreset(null);
  return parseLightThemePreset(
    window.localStorage.getItem(LIGHT_THEME_PRESET_STORAGE_KEY)
      ?? window.localStorage.getItem(LEGACY_THEME_PRESET_STORAGE_KEY),
  );
}

export function readInitialDarkThemePreset(): DarkThemePreset {
  if (typeof window === "undefined") return parseDarkThemePreset(null);
  return parseDarkThemePreset(window.localStorage.getItem(DARK_THEME_PRESET_STORAGE_KEY));
}

export function readInitialTextSize(): TextSize {
  if (typeof window === "undefined") return parseTextSize(null);
  return parseTextSize(window.localStorage.getItem(TEXT_SIZE_STORAGE_KEY));
}

export function readInitialPointerCursors(): boolean {
  if (typeof window === "undefined") return parsePointerCursors(null);
  return parsePointerCursors(window.localStorage.getItem(POINTER_CURSORS_STORAGE_KEY));
}

export function readInitialDockIcon(): DockIcon {
  if (typeof window === "undefined") return parseDockIcon(null);
  return parseDockIcon(window.localStorage.getItem(DOCK_ICON_STORAGE_KEY));
}

export function readInitialDiffMarkers(): DiffMarkers {
  if (typeof window === "undefined") return parseDiffMarkers(null);
  return parseDiffMarkers(window.localStorage.getItem(DIFF_MARKERS_STORAGE_KEY));
}

export function readInitialFileIconTheme(): FileIconThemeId {
  if (typeof window === "undefined") return "default";
  const stored = window.localStorage.getItem(FILE_ICON_THEME_STORAGE_KEY);
  return isFileIconThemeId(stored) ? stored : "default";
}

export function readInitialSidebarNavigationLayout(): SidebarNavigationLayout {
  if (typeof window === "undefined") return DEFAULT_SIDEBAR_NAVIGATION_LAYOUT;
  return parseSidebarNavigationLayout(window.localStorage.getItem(SIDEBAR_NAVIGATION_LAYOUT_STORAGE_KEY));
}

export function readInitialSidebarNavigationVisibilitySettings(): SidebarNavigationVisibilitySettings {
  if (typeof window === "undefined") return parseSidebarNavigationVisibilitySettings(null);
  return parseSidebarNavigationVisibilitySettings(
    window.localStorage.getItem(SIDEBAR_NAVIGATION_VISIBILITY_STORAGE_KEY),
  );
}

export function readInitialGitDisplayMode(): GitDisplayMode {
  if (typeof window === "undefined") return parseGitDisplayMode(null);
  return parseGitDisplayMode(window.localStorage.getItem(GIT_DISPLAY_MODE_STORAGE_KEY));
}

export function readInitialFilesVisibilitySettings(): FilesVisibilitySettings {
  if (typeof window === "undefined") return parseFilesVisibilitySettings(null);
  return parseFilesVisibilitySettings(window.localStorage.getItem(FILES_VISIBILITY_STORAGE_KEY));
}

export function readInitialExternalAppsSettings(): ExternalAppsSettings {
  if (typeof window === "undefined") return parseExternalAppsSettings(null);
  return parseExternalAppsSettings(window.localStorage.getItem(EXTERNAL_APPS_STORAGE_KEY));
}

export function readInitialRightSidebarToolsSettings(): RightSidebarToolsSettings {
  if (typeof window === "undefined") return parseRightSidebarToolsSettings(null);
  return parseRightSidebarToolsSettings(window.localStorage.getItem(RIGHT_SIDEBAR_TOOLS_STORAGE_KEY));
}

export function readInitialTitlebarActionsSettings(): TitlebarActionsSettings {
  if (typeof window === "undefined") return parseTitlebarActionsSettings(null);
  return parseTitlebarActionsSettings(window.localStorage.getItem(TITLEBAR_ACTIONS_STORAGE_KEY));
}

export function mergePuppyoneWorkspaceConfig(
  current: PuppyoneWorkspaceConfig | null,
  patch: Partial<{
    sync: {
      sourceOfTruth: Partial<PuppyoneWorkspaceConfig["sync"]["sourceOfTruth"]>;
    };
    backup: Partial<PuppyoneWorkspaceConfig["backup"]>;
    git: Partial<PuppyoneWorkspaceConfig["git"]>;
    cloud: Partial<PuppyoneWorkspaceConfig["cloud"]>;
  }>,
): PuppyoneWorkspaceConfig {
  const currentSourceOfTruth = current?.sync?.sourceOfTruth;
  const sourceOfTruth = {
    service: currentSourceOfTruth?.service ?? current?.backup?.service ?? "github",
    remote: currentSourceOfTruth?.remote ?? current?.git?.primaryRemote ?? current?.backup?.remote ?? null,
    branch: currentSourceOfTruth?.branch ?? current?.git?.watchedBranch ?? current?.backup?.branch ?? null,
    ...patch.sync?.sourceOfTruth,
  };
  if (sourceOfTruth.service === "puppyone") {
    sourceOfTruth.branch = null;
  }

  const git = {
    primaryRemote: current?.git?.primaryRemote ?? sourceOfTruth.remote,
    watchedBranch: current?.git?.watchedBranch ?? sourceOfTruth.branch,
    ...patch.git,
  };
  if (sourceOfTruth.service === "puppyone") {
    git.watchedBranch = null;
  }

  const backup = {
    enabled: current?.backup?.enabled ?? false,
    service: current?.backup?.service ?? sourceOfTruth.service,
    remote: current?.backup?.remote ?? sourceOfTruth.remote,
    branch: current?.backup?.branch ?? sourceOfTruth.branch,
    ...patch.backup,
  };
  if (backup.service === "puppyone") {
    backup.branch = null;
  }

  return {
    version: 1,
    sync: {
      sourceOfTruth,
    },
    git,
    backup,
    cloud: {
      projectId: current?.cloud?.projectId ?? null,
      ...patch.cloud,
    },
    ...(current?.updatedAt ? { updatedAt: current.updatedAt } : {}),
  };
}

export function readInitialAiEditAssistEnabled(): boolean {
  if (typeof window === "undefined") return parseAiEditAssistEnabled(null);
  return parseAiEditAssistEnabled(window.localStorage.getItem(AI_EDIT_ASSIST_STORAGE_KEY));
}

export function readInitialExperimentalSettings(): ExperimentalSettings {
  if (typeof window === "undefined") return parseExperimentalSettings(null);
  return parseExperimentalSettings(window.localStorage.getItem(EXPERIMENTAL_SETTINGS_STORAGE_KEY));
}

export function readInitialExplorerWidth(): number {
  if (typeof window === "undefined") return DEFAULT_EXPLORER_WIDTH;
  const stored = Number(window.localStorage.getItem(EXPLORER_WIDTH_STORAGE_KEY));
  if (!Number.isFinite(stored)) return DEFAULT_EXPLORER_WIDTH;
  return Math.min(Math.max(Math.round(stored), MIN_EXPLORER_WIDTH), MAX_EXPLORER_WIDTH);
}

export function readInitialSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
}

export function readInitialRightSidebarWidth(): number {
  if (typeof window === "undefined") return DEFAULT_RIGHT_SIDEBAR_WIDTH;
  const stored = Number(window.localStorage.getItem(RIGHT_SIDEBAR_WIDTH_STORAGE_KEY));
  if (!Number.isFinite(stored)) return DEFAULT_RIGHT_SIDEBAR_WIDTH;
  return Math.min(Math.max(Math.round(stored), MIN_RIGHT_SIDEBAR_WIDTH), MAX_RIGHT_SIDEBAR_WIDTH);
}

export function readInitialRightSidebarSurface(): RightSidebarSurface {
  if (typeof window === "undefined") return "terminal";
  return window.localStorage.getItem(RIGHT_SIDEBAR_SURFACE_STORAGE_KEY) === "chat" ? "chat" : "terminal";
}

export function readInitialAgentPreferredModel(): string | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(AGENT_PREFERRED_MODEL_STORAGE_KEY);
  return typeof stored === "string" && stored.trim().length > 0 ? stored.trim().slice(0, 200) : null;
}

export function readSystemDarkMode(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
