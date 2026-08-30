import { isFileIconThemeId, type FileIconThemeId } from "@puppyone/shared-ui";
import {
  parseLoadingAnimationPreset,
  parsePointerCursors,
  parseSidebarNavigationLayout,
  parseTextSize,
  parseThemeMode,
  parseTypography,
  type DarkThemePreset,
  type LightThemePreset,
  type LoadingAnimationPreset,
  type SidebarNavigationLayout,
  type TextSize,
  type ThemeMode,
  type TypographyPreferences,
} from "../../preferences";
import {
  DEFAULT_MARKDOWN_PRESENTATION_SETTINGS,
  parseMarkdownPresentationSettings,
  type MarkdownPresentationSettings,
} from "../markdown/markdownPresentation";
import {
  APPEARANCE_PREFERENCES_STORAGE_KEY,
  getInterfaceStyleSubThemePolicy,
  parseInterfaceStyle,
  type InterfaceStyle,
} from "./interfaceStyles";
import { isSubThemeId, normalizeSubThemeId } from "../themes/subThemePreferences";

export { APPEARANCE_PREFERENCES_STORAGE_KEY };

export const APPEARANCE_PREFERENCES_SCHEMA_VERSION = 3 as const;

export type AppearanceSharedPreferences = Readonly<{
  textSize: TextSize;
  typography: TypographyPreferences;
  pointerCursors: boolean;
  loadingAnimationPreset: LoadingAnimationPreset;
  fileIconTheme: FileIconThemeId;
  sidebarNavigationLayout: SidebarNavigationLayout;
}>;

export type RootThemeAppearancePreferences = Readonly<{
  requestedSubThemeId: string;
  requestedColorMode: ThemeMode;
}>;

export type AppearanceSurfaceOverridePreferences = Readonly<{
  markdown: MarkdownPresentationSettings;
}>;

export type AppearancePreferencesV3 = Readonly<{
  schemaVersion: typeof APPEARANCE_PREFERENCES_SCHEMA_VERSION;
  activeRootThemeId: InterfaceStyle;
  shared: AppearanceSharedPreferences;
  byRootTheme: Readonly<Record<string, RootThemeAppearancePreferences>>;
  bySurface: AppearanceSurfaceOverridePreferences;
}>;

export type LegacyAppearanceSnapshot = Readonly<{
  activeStyle: InterfaceStyle;
  themeMode: ThemeMode;
  lightThemePreset: LightThemePreset;
  darkThemePreset: DarkThemePreset;
  legacySubThemeId?: string | null;
  markdownPresentation?: MarkdownPresentationSettings;
  textSize: TextSize;
  typography: TypographyPreferences;
  pointerCursors: boolean;
  loadingAnimationPreset: LoadingAnimationPreset;
  fileIconTheme: FileIconThemeId;
  sidebarNavigationLayout: SidebarNavigationLayout;
}>;

export type AppearancePreferencesReadResult = Readonly<{
  preferences: AppearancePreferencesV3;
  source: "v3" | "migrated" | "legacy" | "future";
  writable: boolean;
}>;

export function readAppearancePreferences(
  serialized: string | null | undefined,
  legacy: LegacyAppearanceSnapshot,
): AppearancePreferencesReadResult {
  if (!serialized) {
    return { preferences: fromLegacy(legacy), source: "legacy", writable: true };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return { preferences: fromLegacy(legacy), source: "migrated", writable: true };
  }
  if (!isRecord(parsed)) {
    return { preferences: fromLegacy(legacy), source: "migrated", writable: true };
  }

  if (
    typeof parsed.schemaVersion === "number"
    && parsed.schemaVersion > APPEARANCE_PREFERENCES_SCHEMA_VERSION
  ) {
    return { preferences: fromLegacy(legacy), source: "future", writable: false };
  }

  return {
    preferences: parsed.schemaVersion === APPEARANCE_PREFERENCES_SCHEMA_VERSION
      ? normalizeV3(parsed, legacy)
      : migrateLegacyDocument(parsed, legacy),
    source: parsed.schemaVersion === APPEARANCE_PREFERENCES_SCHEMA_VERSION ? "v3" : "migrated",
    writable: true,
  };
}

export function serializeAppearancePreferences(preferences: AppearancePreferencesV3): string {
  return JSON.stringify(preferences);
}

export function createAppearancePreferencesV3(input: {
  activeRootThemeId: InterfaceStyle;
  shared: AppearanceSharedPreferences;
  byRootTheme: Readonly<Record<string, RootThemeAppearancePreferences>>;
  bySurface?: Partial<AppearanceSurfaceOverridePreferences>;
}): AppearancePreferencesV3 {
  return Object.freeze({
    schemaVersion: APPEARANCE_PREFERENCES_SCHEMA_VERSION,
    activeRootThemeId: input.activeRootThemeId,
    shared: Object.freeze({ ...input.shared }),
    byRootTheme: freezeRootThemePreferences(input.byRootTheme),
    bySurface: Object.freeze({
      markdown: Object.freeze({
        ...(input.bySurface?.markdown ?? DEFAULT_MARKDOWN_PRESENTATION_SETTINGS),
      }),
    }),
  });
}

function fromLegacy(legacy: LegacyAppearanceSnapshot): AppearancePreferencesV3 {
  const activeRootThemeId = legacy.activeStyle;
  return createAppearancePreferencesV3({
    activeRootThemeId,
    shared: sharedFromLegacy(legacy),
    byRootTheme: createDefaultRootThemePreferences({
      activeRootThemeId,
      requestedColorMode: legacy.themeMode,
      requestedSubThemeId: resolveLegacyDefaultSubTheme(legacy),
    }),
    bySurface: {
      markdown: legacy.markdownPresentation ?? DEFAULT_MARKDOWN_PRESENTATION_SETTINGS,
    },
  });
}

function migrateLegacyDocument(
  input: Record<string, unknown>,
  legacy: LegacyAppearanceSnapshot,
): AppearancePreferencesV3 {
  const shared = isRecord(input.shared) ? input.shared : input;
  const activeRootThemeId = parseInterfaceStyle(
    asString(input.activeStyle) ?? asString(input.style) ?? legacy.activeStyle,
  );
  const requestedColorMode = parseThemeMode(asString(shared.themeMode) ?? legacy.themeMode);
  const requestedSubThemeId = resolveLegacyDefaultSubTheme({
    ...legacy,
    themeMode: requestedColorMode,
    lightThemePreset: parseLegacyLightPreset(shared.lightThemePreset, legacy.lightThemePreset),
    darkThemePreset: parseLegacyDarkPreset(shared.darkThemePreset, legacy.darkThemePreset),
  });
  const legacyByRoot = isRecord(input.byRootTheme)
    ? readRootThemePreferences(input.byRootTheme, requestedColorMode)
    : readLegacyByStyle(input.byStyle, requestedColorMode);
  const bySurface = isRecord(input.bySurface) ? input.bySurface : {};

  return createAppearancePreferencesV3({
    activeRootThemeId,
    shared: normalizeShared({
      ...shared,
      sidebarNavigationLayout: shared.sidebarNavigationLayout ?? input.navigationLayout,
    }, legacy),
    byRootTheme: {
      ...createDefaultRootThemePreferences({
        activeRootThemeId,
        requestedColorMode,
        requestedSubThemeId,
      }),
      ...legacyByRoot,
    },
    bySurface: {
      markdown: readMarkdownOverrides(bySurface.markdown, legacy.markdownPresentation),
    },
  });
}

function normalizeV3(
  input: Record<string, unknown>,
  legacy: LegacyAppearanceSnapshot,
): AppearancePreferencesV3 {
  const activeRootThemeId = parseInterfaceStyle(
    asString(input.activeRootThemeId) ?? legacy.activeStyle,
  );
  const shared = isRecord(input.shared) ? input.shared : {};
  const bySurface = isRecord(input.bySurface) ? input.bySurface : {};
  const fallbackMode = legacy.themeMode;
  const normalizedRoots = readRootThemePreferences(input.byRootTheme, fallbackMode);

  return createAppearancePreferencesV3({
    activeRootThemeId,
    shared: normalizeShared(shared, legacy),
    byRootTheme: {
      ...createDefaultRootThemePreferences({
        activeRootThemeId,
        requestedColorMode: fallbackMode,
        requestedSubThemeId: resolveLegacyDefaultSubTheme(legacy),
      }),
      ...normalizedRoots,
    },
    bySurface: {
      markdown: readMarkdownOverrides(bySurface.markdown, legacy.markdownPresentation),
    },
  });
}

function normalizeShared(
  shared: Record<string, unknown>,
  legacy: LegacyAppearanceSnapshot,
): AppearanceSharedPreferences {
  const rawFileIconTheme = typeof shared.fileIconTheme === "string" ? shared.fileIconTheme : null;
  return {
    textSize: parseTextSize(asString(shared.textSize) ?? legacy.textSize),
    typography: parseTypography(
      shared.typography === undefined
        ? JSON.stringify(legacy.typography)
        : JSON.stringify(shared.typography),
    ),
    pointerCursors: typeof shared.pointerCursors === "boolean"
      ? shared.pointerCursors
      : parsePointerCursors(String(legacy.pointerCursors)),
    loadingAnimationPreset: parseLoadingAnimationPreset(
      asString(shared.loadingAnimationPreset) ?? legacy.loadingAnimationPreset,
    ),
    fileIconTheme: rawFileIconTheme && isFileIconThemeId(rawFileIconTheme)
      ? rawFileIconTheme
      : legacy.fileIconTheme,
    sidebarNavigationLayout: parseSidebarNavigationLayout(
      asString(shared.sidebarNavigationLayout) ?? legacy.sidebarNavigationLayout,
    ),
  };
}

function sharedFromLegacy(legacy: LegacyAppearanceSnapshot): AppearanceSharedPreferences {
  return {
    textSize: legacy.textSize,
    typography: legacy.typography,
    pointerCursors: legacy.pointerCursors,
    loadingAnimationPreset: legacy.loadingAnimationPreset,
    fileIconTheme: legacy.fileIconTheme,
    sidebarNavigationLayout: legacy.sidebarNavigationLayout,
  };
}

function createDefaultRootThemePreferences({
  activeRootThemeId,
  requestedColorMode,
  requestedSubThemeId,
}: {
  activeRootThemeId: InterfaceStyle;
  requestedColorMode: ThemeMode;
  requestedSubThemeId: string;
}): Record<string, RootThemeAppearancePreferences> {
  return {
    default: {
      requestedColorMode: activeRootThemeId === "default" ? requestedColorMode : "system",
      requestedSubThemeId: activeRootThemeId === "default"
        ? requestedSubThemeId
        : getInterfaceStyleSubThemePolicy("default").defaultSubThemeId,
    },
    "windows-xp": {
      requestedColorMode: activeRootThemeId === "windows-xp" ? requestedColorMode : "light",
      requestedSubThemeId: getInterfaceStyleSubThemePolicy("windows-xp").defaultSubThemeId,
    },
  };
}

function readRootThemePreferences(
  input: unknown,
  fallbackMode: ThemeMode,
): Record<string, RootThemeAppearancePreferences> {
  if (!isRecord(input)) return {};
  return Object.fromEntries(Object.entries(input).flatMap(([rootThemeId, value]) => {
    if (!isRecord(value)) return [];
    const requestedSubThemeId = asString(value.requestedSubThemeId);
    if (!requestedSubThemeId) return [];
    const normalized = normalizeSubThemeId(requestedSubThemeId);
    if (!isSubThemeId(normalized)) return [];
    return [[rootThemeId, {
      requestedSubThemeId: normalized,
      requestedColorMode: parseThemeMode(asString(value.requestedColorMode) ?? fallbackMode),
    }]];
  }));
}

function readLegacyByStyle(
  input: unknown,
  fallbackMode: ThemeMode,
): Record<string, RootThemeAppearancePreferences> {
  if (!isRecord(input)) return {};
  return readRootThemePreferences(Object.fromEntries(Object.entries(input).map(([key, value]) => {
    if (!isRecord(value)) return [key, value];
    return [key, {
      requestedSubThemeId: value.requestedSubThemeId ?? value.subThemeId,
      requestedColorMode: value.requestedColorMode ?? value.themeMode ?? fallbackMode,
    }];
  })), fallbackMode);
}

function readMarkdownOverrides(
  input: unknown,
  fallback = DEFAULT_MARKDOWN_PRESENTATION_SETTINGS,
): MarkdownPresentationSettings {
  if (!isRecord(input)) return fallback;
  return parseMarkdownPresentationSettings(JSON.stringify({ version: 2, ...input }));
}

function resolveLegacyDefaultSubTheme(legacy: LegacyAppearanceSnapshot): string {
  if (legacy.legacySubThemeId) {
    const normalized = normalizeSubThemeId(legacy.legacySubThemeId);
    if (isSubThemeId(normalized)) return normalized;
  }
  if (legacy.lightThemePreset === "warm" && legacy.darkThemePreset === "warm") {
    return "default.warm";
  }
  if (legacy.lightThemePreset === "graphite" && legacy.darkThemePreset === "graphite") {
    return "default.graphite";
  }
  if (legacy.themeMode === "dark") {
    if (legacy.darkThemePreset === "warm") return "default.warm";
    if (legacy.darkThemePreset === "graphite") return "default.graphite";
  }
  if (legacy.themeMode === "light") {
    if (legacy.lightThemePreset === "warm") return "default.warm";
    if (legacy.lightThemePreset === "graphite") return "default.graphite";
  }
  return getInterfaceStyleSubThemePolicy("default").defaultSubThemeId;
}

function parseLegacyLightPreset(value: unknown, fallback: LightThemePreset): LightThemePreset {
  return value === "neutral" || value === "warm" || value === "graphite" ? value : fallback;
}

function parseLegacyDarkPreset(value: unknown, fallback: DarkThemePreset): DarkThemePreset {
  return value === "default" || value === "warm" || value === "graphite" ? value : fallback;
}

function freezeRootThemePreferences(
  input: Readonly<Record<string, RootThemeAppearancePreferences>>,
): Readonly<Record<string, RootThemeAppearancePreferences>> {
  return Object.freeze(Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, Object.freeze({ ...value })]),
  ));
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return Boolean(input) && typeof input === "object" && !Array.isArray(input);
}

function asString(input: unknown): string | null {
  return typeof input === "string" ? input : null;
}
