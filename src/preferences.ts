export type ThemeMode = "system" | "light" | "dark";
export type LightThemePreset = "neutral" | "warm" | "graphite";
export type DarkThemePreset = "default" | "warm" | "graphite";
export type TextSize = "small" | "default" | "large";
export type DockIcon = "polished" | "light" | "matte";
export type DiffMarkers = "color" | "symbols";
export type GitDisplayMode = "simple" | "professional";

export type SidebarNavigationLayout =
  | "bottom-horizontal"
  | "top-horizontal"
  | "left-vertical";

export type SidebarNavigationPlacement = "top" | "left" | "bottom";
export type SidebarNavigationOrientation = "horizontal" | "vertical";
export type FilesVisibilitySettings = {
  showHiddenFiles: boolean;
  excludePatterns: string[];
};
export type ExternalAppOpenMode = "system";
export type ExternalAppOverride = {
  extension: string;
  appPath: string;
  appName?: string | null;
  bundleId?: string | null;
  iconDataUrl?: string | null;
};
export type ExternalAppsSettings = {
  openMode: ExternalAppOpenMode;
  overrides: ExternalAppOverride[];
};
export const RIGHT_SIDEBAR_TOOL_IDS = ["terminal"] as const;
export type RightSidebarToolId = typeof RIGHT_SIDEBAR_TOOL_IDS[number];
export type RightSidebarToolsSettings = {
  enabled: Record<RightSidebarToolId, boolean>;
  order: RightSidebarToolId[];
};
export const TITLEBAR_ACTION_IDS = ["external-open", "terminal"] as const;
export type TitlebarActionId = typeof TITLEBAR_ACTION_IDS[number];
export type TitlebarActionsSettings = {
  enabled: Record<TitlebarActionId, boolean>;
  order: TitlebarActionId[];
};
export type ExperimentalSettings = {
  enableAgentChat: boolean;
  enableAssetLibraryHome: boolean;
  enablePuppyoneAppFiles: boolean;
  enablePuppyFlowFiles: boolean;
};

export const THEME_STORAGE_KEY = "puppyone.desktop.theme";
export const LEGACY_THEME_PRESET_STORAGE_KEY = "puppyone.desktop.themePreset";
export const LIGHT_THEME_PRESET_STORAGE_KEY = "puppyone.desktop.lightThemePreset";
export const DARK_THEME_PRESET_STORAGE_KEY = "puppyone.desktop.darkThemePreset";
export const TEXT_SIZE_STORAGE_KEY = "puppyone.desktop.textSize";
export const POINTER_CURSORS_STORAGE_KEY = "puppyone.desktop.pointerCursors";
export const DOCK_ICON_STORAGE_KEY = "puppyone.desktop.dockIcon";
export const DIFF_MARKERS_STORAGE_KEY = "puppyone.desktop.diffMarkers";
export const FILE_ICON_THEME_STORAGE_KEY = "puppyone.desktop.fileIconTheme";
export const SIDEBAR_NAVIGATION_LAYOUT_STORAGE_KEY = "puppyone.desktop.sidebarNavigationLayout";
export const FILES_VISIBILITY_STORAGE_KEY = "puppyone.desktop.filesVisibility";
export const EXTERNAL_APPS_STORAGE_KEY = "puppyone.desktop.externalApps";
export const RIGHT_SIDEBAR_TOOLS_STORAGE_KEY = "puppyone.desktop.rightSidebarTools";
export const TITLEBAR_ACTIONS_STORAGE_KEY = "puppyone.desktop.titlebarActions";
export const AI_EDIT_ASSIST_STORAGE_KEY = "puppyone.desktop.aiEditAssist";
export const GIT_DISPLAY_MODE_STORAGE_KEY = "puppyone.desktop.gitDisplayMode";
export const EXPERIMENTAL_SETTINGS_STORAGE_KEY = "puppyone.desktop.experimental";

export const DEFAULT_THEME_MODE: ThemeMode = "system";
export const DEFAULT_LIGHT_THEME_PRESET: LightThemePreset = "neutral";
export const DEFAULT_DARK_THEME_PRESET: DarkThemePreset = "default";
export const DEFAULT_TEXT_SIZE: TextSize = "default";
export const DEFAULT_POINTER_CURSORS = false;
export const DEFAULT_DOCK_ICON: DockIcon = "polished";
export const DEFAULT_DIFF_MARKERS: DiffMarkers = "color";
export const DEFAULT_GIT_DISPLAY_MODE: GitDisplayMode = "simple";
export const DEFAULT_SIDEBAR_NAVIGATION_LAYOUT: SidebarNavigationLayout = "bottom-horizontal";
export const DEFAULT_EXPLORER_EXCLUDE_PATTERNS = [
  "**/.git",
  "**/.puppyone",
  "**/.svn",
  "**/.hg",
  "**/.DS_Store",
  "**/Thumbs.db",
];
export const DEFAULT_FILES_VISIBILITY_SETTINGS: FilesVisibilitySettings = {
  showHiddenFiles: false,
  excludePatterns: [...DEFAULT_EXPLORER_EXCLUDE_PATTERNS],
};
export const DEFAULT_EXTERNAL_APPS_SETTINGS: ExternalAppsSettings = {
  openMode: "system",
  overrides: [],
};
export const DEFAULT_RIGHT_SIDEBAR_TOOLS_SETTINGS: RightSidebarToolsSettings = {
  enabled: {
    terminal: true,
  },
  order: [...RIGHT_SIDEBAR_TOOL_IDS],
};
export const DEFAULT_TITLEBAR_ACTIONS_SETTINGS: TitlebarActionsSettings = {
  enabled: {
    "external-open": true,
    terminal: true,
  },
  order: [...TITLEBAR_ACTION_IDS],
};
export const DEFAULT_AI_EDIT_ASSIST_ENABLED = false;
export const DEFAULT_EXPERIMENTAL_SETTINGS: ExperimentalSettings = {
  enableAgentChat: false,
  enableAssetLibraryHome: false,
  enablePuppyoneAppFiles: false,
  enablePuppyFlowFiles: false,
};

export const SIDEBAR_NAVIGATION_LAYOUT_OPTIONS = [
  {
    value: "bottom-horizontal",
    label: "Bottom",
    description: "Horizontal controls at the bottom of the sidebar.",
    placement: "bottom",
    orientation: "horizontal",
  },
  {
    value: "top-horizontal",
    label: "Top",
    description: "Horizontal controls above the file tree.",
    placement: "top",
    orientation: "horizontal",
  },
  {
    value: "left-vertical",
    label: "Left",
    description: "Vertical controls on the left edge of the sidebar.",
    placement: "left",
    orientation: "vertical",
  },
] as const satisfies ReadonlyArray<{
  value: SidebarNavigationLayout;
  label: string;
  description: string;
  placement: SidebarNavigationPlacement;
  orientation: SidebarNavigationOrientation;
}>;

export const LIGHT_THEME_PRESETS = [
  {
    id: "neutral",
    label: "Neutral",
    description: "Clean light surfaces with restrained contrast.",
    swatches: ["#f5f4f0", "#ffffff", "#2563eb"],
  },
  {
    id: "warm",
    label: "Warm",
    description: "The original Puppyone warm desktop palette.",
    swatches: ["#f1eadf", "#fbf6ed", "#b45309"],
  },
  {
    id: "graphite",
    label: "Graphite",
    description: "Cooler surfaces for a denser workspace feel.",
    swatches: ["#f3f4f6", "#ffffff", "#4f46e5"],
  },
] as const satisfies ReadonlyArray<{
  id: LightThemePreset;
  label: string;
  description: string;
  swatches: readonly [string, string, string];
}>;

export const DARK_THEME_PRESETS = [
  {
    id: "default",
    label: "Default",
    description: "The current Puppyone dark palette.",
    swatches: ["#11100f", "#1d1b1a", "#60a5fa"],
  },
  {
    id: "warm",
    label: "Warm",
    description: "A softly amber dark palette for late-night work.",
    swatches: ["#18130f", "#211a14", "#f0a45d"],
  },
  {
    id: "graphite",
    label: "Graphite",
    description: "A cooler dark workspace palette.",
    swatches: ["#101114", "#1b1c1f", "#8b8cff"],
  },
] as const satisfies ReadonlyArray<{
  id: DarkThemePreset;
  label: string;
  description: string;
  swatches: readonly [string, string, string];
}>;

export const TEXT_SIZE_PRESETS = [
  {
    value: "small",
    label: "Small",
    description: "Sidebar 12px, content 13px, code 12px.",
    sizes: {
      micro: 9,
      caption: 10,
      meta: 11,
      sidebar: 12,
      body: 12,
      bodyLarge: 13,
      content: 13,
      code: 12,
      title: 15,
      pageTitle: 18,
      display: 22,
    },
  },
  {
    value: "default",
    label: "Default",
    description: "Sidebar 13px, content 14px, code 13px.",
    sizes: {
      micro: 10,
      caption: 11,
      meta: 12,
      sidebar: 13,
      body: 13,
      bodyLarge: 14,
      content: 14,
      code: 13,
      title: 16,
      pageTitle: 20,
      display: 24,
    },
  },
  {
    value: "large",
    label: "Large",
    description: "Sidebar 14px, content 16px, code 15px.",
    sizes: {
      micro: 11,
      caption: 12,
      meta: 13,
      sidebar: 14,
      body: 14,
      bodyLarge: 16,
      content: 16,
      code: 15,
      title: 18,
      pageTitle: 22,
      display: 28,
    },
  },
] as const satisfies ReadonlyArray<{
  value: TextSize;
  label: string;
  description: string;
  sizes: {
    micro: number;
    caption: number;
    meta: number;
    sidebar: number;
    body: number;
    bodyLarge: number;
    content: number;
    code: number;
    title: number;
    pageTitle: number;
    display: number;
  };
}>;

export const DOCK_ICON_OPTIONS = [
  {
    id: "polished",
    label: "Polished",
    description: "The current high-contrast PuppyOne icon.",
    previewSrc: "/logo-square.png",
  },
  {
    id: "light",
    label: "Light",
    description: "A warm light icon with a quiet outline.",
    previewSrc: "/logo-square-v0.1.3-light.png",
  },
  {
    id: "matte",
    label: "Matte",
    description: "A flat dark icon without the metallic rim.",
    previewSrc: "/logo-square-v0.1.3-dark.png",
  },
] as const satisfies ReadonlyArray<{
  id: DockIcon;
  label: string;
  description: string;
  previewSrc: string;
}>;

export function parseThemeMode(value: string | null | undefined): ThemeMode {
  return value === "light" || value === "dark" || value === "system" ? value : DEFAULT_THEME_MODE;
}

export function parseLightThemePreset(value: string | null | undefined): LightThemePreset {
  return isLightThemePreset(value) ? value : DEFAULT_LIGHT_THEME_PRESET;
}

export function isLightThemePreset(value: string | null | undefined): value is LightThemePreset {
  return value === "neutral" || value === "warm" || value === "graphite";
}

export function parseDarkThemePreset(value: string | null | undefined): DarkThemePreset {
  return isDarkThemePreset(value) ? value : DEFAULT_DARK_THEME_PRESET;
}

export function isDarkThemePreset(value: string | null | undefined): value is DarkThemePreset {
  return value === "default" || value === "warm" || value === "graphite";
}

export function parseTextSize(value: string | null | undefined): TextSize {
  return value === "small" || value === "large" || value === "default" ? value : DEFAULT_TEXT_SIZE;
}

export function parsePointerCursors(value: string | null | undefined): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  return DEFAULT_POINTER_CURSORS;
}

export function parseDockIcon(value: string | null | undefined): DockIcon {
  return value === "light" || value === "matte" || value === "polished" ? value : DEFAULT_DOCK_ICON;
}

export function parseDiffMarkers(value: string | null | undefined): DiffMarkers {
  return value === "symbols" || value === "color" ? value : DEFAULT_DIFF_MARKERS;
}

export function parseGitDisplayMode(value: string | null | undefined): GitDisplayMode {
  return value === "professional" || value === "simple" ? value : DEFAULT_GIT_DISPLAY_MODE;
}

export function parseSidebarNavigationLayout(value: string | null | undefined): SidebarNavigationLayout {
  if (value === "bottom") return "bottom-horizontal";
  if (value === "top") return "top-horizontal";
  if (value === "vertical" || value === "bottom-vertical" || value === "top-vertical") return "left-vertical";
  return isSidebarNavigationLayout(value) ? value : DEFAULT_SIDEBAR_NAVIGATION_LAYOUT;
}

export function isSidebarNavigationLayout(value: string | null | undefined): value is SidebarNavigationLayout {
  return value === "bottom-horizontal"
    || value === "top-horizontal"
    || value === "left-vertical";
}

export function getSidebarNavigationPlacement(layout: SidebarNavigationLayout): SidebarNavigationPlacement {
  return SIDEBAR_NAVIGATION_LAYOUT_OPTIONS.find((option) => option.value === layout)?.placement ?? "bottom";
}

export function getSidebarNavigationOrientation(layout: SidebarNavigationLayout): SidebarNavigationOrientation {
  return SIDEBAR_NAVIGATION_LAYOUT_OPTIONS.find((option) => option.value === layout)?.orientation ?? "horizontal";
}

export function parseFilesVisibilitySettings(value: string | null | undefined): FilesVisibilitySettings {
  if (!value) return DEFAULT_FILES_VISIBILITY_SETTINGS;

  try {
    const parsed = JSON.parse(value) as Partial<FilesVisibilitySettings> | null;
    if (!parsed || typeof parsed !== "object") return DEFAULT_FILES_VISIBILITY_SETTINGS;

    return {
      showHiddenFiles: parsed.showHiddenFiles === true,
      excludePatterns: Array.isArray(parsed.excludePatterns)
        ? normalizeExplorerExcludePatterns(parsed.excludePatterns)
        : [...DEFAULT_EXPLORER_EXCLUDE_PATTERNS],
    };
  } catch {
    return DEFAULT_FILES_VISIBILITY_SETTINGS;
  }
}

export function parseExternalAppsSettings(value: string | null | undefined): ExternalAppsSettings {
  if (!value) return DEFAULT_EXTERNAL_APPS_SETTINGS;

  try {
    const parsed = JSON.parse(value) as Partial<ExternalAppsSettings> | null;
    if (!parsed || typeof parsed !== "object") return DEFAULT_EXTERNAL_APPS_SETTINGS;

    return {
      openMode: "system",
      overrides: normalizeExternalAppOverrides(parsed.overrides),
    };
  } catch {
    return DEFAULT_EXTERNAL_APPS_SETTINGS;
  }
}

export function parseRightSidebarToolsSettings(value: string | null | undefined): RightSidebarToolsSettings {
  if (!value) return DEFAULT_RIGHT_SIDEBAR_TOOLS_SETTINGS;

  try {
    const parsed = JSON.parse(value) as Partial<RightSidebarToolsSettings> | Partial<Record<RightSidebarToolId, boolean>> | null;
    if (!parsed || typeof parsed !== "object") return DEFAULT_RIGHT_SIDEBAR_TOOLS_SETTINGS;

    return {
      enabled: {
        terminal: readRightSidebarToolEnabled(parsed, "terminal"),
      },
      order: normalizeRightSidebarToolOrder("order" in parsed ? parsed.order : undefined),
    };
  } catch {
    return DEFAULT_RIGHT_SIDEBAR_TOOLS_SETTINGS;
  }
}

export function parseTitlebarActionsSettings(value: string | null | undefined): TitlebarActionsSettings {
  if (!value) return DEFAULT_TITLEBAR_ACTIONS_SETTINGS;

  try {
    const parsed = JSON.parse(value) as Partial<TitlebarActionsSettings> & { showExternalOpenButton?: boolean } | null;
    if (!parsed || typeof parsed !== "object") return DEFAULT_TITLEBAR_ACTIONS_SETTINGS;

    const legacyExternalOpenEnabled = parsed.showExternalOpenButton !== false;
    return {
      enabled: {
        "external-open": readTitlebarActionEnabled(parsed, "external-open", legacyExternalOpenEnabled),
        terminal: readTitlebarActionEnabled(parsed, "terminal", true),
      },
      order: normalizeTitlebarActionOrder(parsed.order),
    };
  } catch {
    return DEFAULT_TITLEBAR_ACTIONS_SETTINGS;
  }
}

export function parseAiEditAssistEnabled(value: string | null | undefined): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  return DEFAULT_AI_EDIT_ASSIST_ENABLED;
}

export function parseExperimentalSettings(value: string | null | undefined): ExperimentalSettings {
  if (!value) return DEFAULT_EXPERIMENTAL_SETTINGS;

  try {
    const parsed = JSON.parse(value) as Partial<ExperimentalSettings> | null;
    if (!parsed || typeof parsed !== "object") return DEFAULT_EXPERIMENTAL_SETTINGS;

    const legacy = parsed as typeof parsed & { enableAgentCompanion?: unknown };
    return {
      enableAgentChat: parsed.enableAgentChat === true || legacy.enableAgentCompanion === true,
      enableAssetLibraryHome: parsed.enableAssetLibraryHome === true,
      enablePuppyoneAppFiles: parsed.enablePuppyoneAppFiles === true,
      enablePuppyFlowFiles: parsed.enablePuppyFlowFiles === true,
    };
  } catch {
    return DEFAULT_EXPERIMENTAL_SETTINGS;
  }
}

function normalizeExternalAppOverrides(value: unknown): ExternalAppOverride[] {
  if (!Array.isArray(value)) return [];

  const overrides: ExternalAppOverride[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const rawExtension = "extension" in item ? item.extension : null;
    const rawAppPath = "appPath" in item ? item.appPath : null;
    if (typeof rawExtension !== "string" || typeof rawAppPath !== "string") continue;

    const extension = normalizeExternalAppExtension(rawExtension);
    const appPath = rawAppPath.trim();
    if (!extension || !appPath || seen.has(extension)) continue;

    const appName = readOptionalTrimmedString("appName" in item ? item.appName : null);
    const bundleId = readOptionalTrimmedString("bundleId" in item ? item.bundleId : null);
    const iconDataUrl = readOptionalDataImageUrl("iconDataUrl" in item ? item.iconDataUrl : null);

    seen.add(extension);
    overrides.push({
      extension,
      appPath,
      ...(appName ? { appName } : {}),
      ...(bundleId ? { bundleId } : {}),
      ...(iconDataUrl ? { iconDataUrl } : {}),
    });
  }
  return overrides;
}

export function getExternalAppExtension(value: string | null | undefined): string | null {
  if (!value) return null;
  const leafName = value.replace(/\\/g, "/").split("/").pop() ?? value;
  const dotIndex = leafName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === leafName.length - 1) return null;
  const extension = normalizeExternalAppExtension(leafName.slice(dotIndex + 1));
  return extension || null;
}

export function getExternalAppOverrideForExtension(
  settings: ExternalAppsSettings,
  extension: string | null | undefined,
): ExternalAppOverride | null {
  const normalizedExtension = normalizeExternalAppExtension(extension ?? "");
  if (!normalizedExtension) return null;
  return settings.overrides.find((override) => override.extension === normalizedExtension) ?? null;
}

export function upsertExternalAppOverride(
  settings: ExternalAppsSettings,
  override: ExternalAppOverride,
): ExternalAppsSettings {
  const extension = normalizeExternalAppExtension(override.extension);
  const appPath = override.appPath.trim();
  if (!extension || !appPath) return settings;
  const appName = override.appName?.trim();
  const bundleId = override.bundleId?.trim();
  const iconDataUrl = readOptionalDataImageUrl(override.iconDataUrl);

  const nextOverride: ExternalAppOverride = {
    extension,
    appPath,
    ...(appName ? { appName } : {}),
    ...(bundleId ? { bundleId } : {}),
    ...(iconDataUrl ? { iconDataUrl } : {}),
  };

  return {
    ...settings,
    overrides: [
      nextOverride,
      ...settings.overrides.filter((item) => item.extension !== extension),
    ],
  };
}

export function removeExternalAppOverride(
  settings: ExternalAppsSettings,
  extension: string | null | undefined,
): ExternalAppsSettings {
  const normalizedExtension = normalizeExternalAppExtension(extension ?? "");
  if (!normalizedExtension) return settings;
  return {
    ...settings,
    overrides: settings.overrides.filter((item) => item.extension !== normalizedExtension),
  };
}

export function normalizeExternalAppExtension(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/^\*?\./, "");
  return /^[a-z0-9][a-z0-9_-]{0,31}$/.test(normalized) ? normalized : "";
}

function readOptionalTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function readOptionalDataImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(trimmed) ? trimmed : null;
}

function readRightSidebarToolEnabled(
  value: Partial<RightSidebarToolsSettings> | Partial<Record<RightSidebarToolId, boolean>>,
  toolId: RightSidebarToolId,
): boolean {
  if ("enabled" in value && value.enabled && typeof value.enabled === "object") {
    return value.enabled[toolId] !== false;
  }

  const legacyValue = value as Partial<Record<RightSidebarToolId, boolean>>;
  return legacyValue[toolId] !== false;
}

function normalizeRightSidebarToolOrder(value: unknown): RightSidebarToolId[] {
  const seen = new Set<RightSidebarToolId>();
  const order: RightSidebarToolId[] = [];

  if (Array.isArray(value)) {
    for (const item of value) {
      if (isRightSidebarToolId(item) && !seen.has(item)) {
        seen.add(item);
        order.push(item);
      }
    }
  }

  for (const toolId of RIGHT_SIDEBAR_TOOL_IDS) {
    if (!seen.has(toolId)) order.push(toolId);
  }

  return order;
}

function isRightSidebarToolId(value: unknown): value is RightSidebarToolId {
  return typeof value === "string" && RIGHT_SIDEBAR_TOOL_IDS.includes(value as RightSidebarToolId);
}

function readTitlebarActionEnabled(
  value: Partial<TitlebarActionsSettings>,
  actionId: TitlebarActionId,
  defaultEnabled: boolean,
): boolean {
  if (!value.enabled || typeof value.enabled !== "object") return defaultEnabled;
  return value.enabled[actionId] !== false;
}

function normalizeTitlebarActionOrder(value: unknown): TitlebarActionId[] {
  const seen = new Set<TitlebarActionId>();
  const order: TitlebarActionId[] = [];

  if (Array.isArray(value)) {
    for (const item of value) {
      if (isTitlebarActionId(item) && !seen.has(item)) {
        seen.add(item);
        order.push(item);
      }
    }
  }

  for (const actionId of TITLEBAR_ACTION_IDS) {
    if (!seen.has(actionId)) order.push(actionId);
  }

  return order;
}

function isTitlebarActionId(value: unknown): value is TitlebarActionId {
  return typeof value === "string" && TITLEBAR_ACTION_IDS.includes(value as TitlebarActionId);
}

export function normalizeExplorerExcludePatterns(value: string | string[]): string[] {
  const lines = Array.isArray(value)
    ? value
    : value.split(/\r?\n|,/);
  const seen = new Set<string>();
  const patterns: string[] = [];

  for (const rawLine of lines) {
    const pattern = rawLine.trim().replace(/\\/g, "/").replace(/^\/+/, "");
    if (!pattern || pattern.startsWith("#") || seen.has(pattern)) continue;
    seen.add(pattern);
    patterns.push(pattern);
  }

  return patterns;
}
