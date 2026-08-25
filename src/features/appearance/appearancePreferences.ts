import { isFileIconThemeId, type FileIconThemeId } from "@puppyone/shared-ui";
import {
  parseDarkThemePreset,
  parseDockIcon,
  parseLightThemePreset,
  parseLoadingAnimationPreset,
  parsePointerCursors,
  parseSidebarNavigationLayout,
  parseTextSize,
  parseThemeMode,
  parseTypography,
  type DarkThemePreset,
  type DockIcon,
  type LightThemePreset,
  type LoadingAnimationPreset,
  type SidebarNavigationLayout,
  type TextSize,
  type ThemeMode,
  type TypographyPreferences,
} from "../../preferences";
import {
  APPEARANCE_PREFERENCES_STORAGE_KEY,
  parseInterfaceStyle,
  type InterfaceStyle,
} from "./interfaceStyles";

export { APPEARANCE_PREFERENCES_STORAGE_KEY };

export const APPEARANCE_PREFERENCES_SCHEMA_VERSION = 2 as const;

export type AppearanceSharedPreferences = Readonly<{
  themeMode: ThemeMode;
  lightThemePreset: LightThemePreset;
  darkThemePreset: DarkThemePreset;
  textSize: TextSize;
  typography: TypographyPreferences;
  pointerCursors: boolean;
  loadingAnimationPreset: LoadingAnimationPreset;
  dockIcon: DockIcon;
  fileIconTheme: FileIconThemeId;
  sidebarNavigationLayout: SidebarNavigationLayout;
}>;

export type AppearanceScopedOptions = Readonly<Record<string, Readonly<Record<string, unknown>>>>;
export type AppearanceStyleSurfaceOptions = Readonly<
  Record<string, Readonly<Record<string, Readonly<Record<string, unknown>>>>>
>;

export type AppearancePreferencesV2 = Readonly<{
  schemaVersion: typeof APPEARANCE_PREFERENCES_SCHEMA_VERSION;
  activeStyle: InterfaceStyle;
  shared: AppearanceSharedPreferences;
  byStyle: AppearanceScopedOptions;
  bySurface: AppearanceScopedOptions;
  byStyleSurface: AppearanceStyleSurfaceOptions;
}>;

export type LegacyAppearanceSnapshot = Readonly<{
  activeStyle: InterfaceStyle;
  themeMode: ThemeMode;
  lightThemePreset: LightThemePreset;
  darkThemePreset: DarkThemePreset;
  textSize: TextSize;
  typography: TypographyPreferences;
  pointerCursors: boolean;
  loadingAnimationPreset: LoadingAnimationPreset;
  dockIcon: DockIcon;
  fileIconTheme: FileIconThemeId;
  sidebarNavigationLayout: SidebarNavigationLayout;
}>;

export type AppearancePreferencesReadResult = Readonly<{
  preferences: AppearancePreferencesV2;
  source: "v2" | "migrated" | "legacy" | "future";
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

  if (typeof parsed.schemaVersion === "number" && parsed.schemaVersion > APPEARANCE_PREFERENCES_SCHEMA_VERSION) {
    return { preferences: fromLegacy(legacy), source: "future", writable: false };
  }

  const migrated = parsed.schemaVersion === 1 ? migrateV1(parsed, legacy) : parsed;
  return {
    preferences: normalizeV2(migrated, legacy),
    source: parsed.schemaVersion === APPEARANCE_PREFERENCES_SCHEMA_VERSION ? "v2" : "migrated",
    writable: true,
  };
}

export function serializeAppearancePreferences(preferences: AppearancePreferencesV2): string {
  return JSON.stringify(preferences);
}

export function createAppearancePreferencesV2(input: {
  activeStyle: InterfaceStyle;
  shared: AppearanceSharedPreferences;
  byStyle?: AppearanceScopedOptions;
  bySurface?: AppearanceScopedOptions;
  byStyleSurface?: AppearanceStyleSurfaceOptions;
}): AppearancePreferencesV2 {
  return Object.freeze({
    schemaVersion: APPEARANCE_PREFERENCES_SCHEMA_VERSION,
    activeStyle: input.activeStyle,
    shared: Object.freeze({ ...input.shared }),
    byStyle: freezeScopedOptions(input.byStyle ?? {}),
    bySurface: freezeScopedOptions(input.bySurface ?? {}),
    byStyleSurface: freezeStyleSurfaceOptions(input.byStyleSurface ?? {}),
  });
}

function fromLegacy(legacy: LegacyAppearanceSnapshot): AppearancePreferencesV2 {
  return createAppearancePreferencesV2({
    activeStyle: legacy.activeStyle,
    shared: {
      themeMode: legacy.themeMode,
      lightThemePreset: legacy.lightThemePreset,
      darkThemePreset: legacy.darkThemePreset,
      textSize: legacy.textSize,
      typography: legacy.typography,
      pointerCursors: legacy.pointerCursors,
      loadingAnimationPreset: legacy.loadingAnimationPreset,
      dockIcon: legacy.dockIcon,
      fileIconTheme: legacy.fileIconTheme,
      sidebarNavigationLayout: legacy.sidebarNavigationLayout,
    },
  });
}

function migrateV1(
  input: Record<string, unknown>,
  legacy: LegacyAppearanceSnapshot,
): Record<string, unknown> {
  const shared = isRecord(input.shared) ? input.shared : input;
  return {
    schemaVersion: APPEARANCE_PREFERENCES_SCHEMA_VERSION,
    activeStyle: input.activeStyle ?? input.style ?? legacy.activeStyle,
    shared: {
      ...shared,
      sidebarNavigationLayout:
        shared.sidebarNavigationLayout ?? input.navigationLayout ?? legacy.sidebarNavigationLayout,
    },
    byStyle: input.byStyle,
    bySurface: input.bySurface,
    byStyleSurface: input.byStyleSurface,
  };
}

function normalizeV2(
  input: unknown,
  legacy: LegacyAppearanceSnapshot,
): AppearancePreferencesV2 {
  const record = isRecord(input) ? input : {};
  const shared = isRecord(record.shared) ? record.shared : {};
  const rawFileIconTheme = typeof shared.fileIconTheme === "string" ? shared.fileIconTheme : null;
  return createAppearancePreferencesV2({
    activeStyle: parseInterfaceStyle(asString(record.activeStyle) ?? legacy.activeStyle),
    shared: {
      themeMode: parseThemeMode(asString(shared.themeMode) ?? legacy.themeMode),
      lightThemePreset: parseLightThemePreset(asString(shared.lightThemePreset) ?? legacy.lightThemePreset),
      darkThemePreset: parseDarkThemePreset(asString(shared.darkThemePreset) ?? legacy.darkThemePreset),
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
      dockIcon: parseDockIcon(asString(shared.dockIcon) ?? legacy.dockIcon),
      fileIconTheme: rawFileIconTheme && isFileIconThemeId(rawFileIconTheme)
        ? rawFileIconTheme
        : legacy.fileIconTheme,
      sidebarNavigationLayout: parseSidebarNavigationLayout(
        asString(shared.sidebarNavigationLayout) ?? legacy.sidebarNavigationLayout,
      ),
    },
    byStyle: readScopedOptions(record.byStyle),
    bySurface: readScopedOptions(record.bySurface),
    byStyleSurface: readStyleSurfaceOptions(record.byStyleSurface),
  });
}

function readScopedOptions(input: unknown): AppearanceScopedOptions {
  if (!isRecord(input)) return {};
  return Object.fromEntries(
    Object.entries(input)
      .filter(([, value]) => isRecord(value))
      .map(([key, value]) => [key, { ...(value as Record<string, unknown>) }]),
  );
}

function readStyleSurfaceOptions(input: unknown): AppearanceStyleSurfaceOptions {
  if (!isRecord(input)) return {};
  return Object.fromEntries(
    Object.entries(input).map(([styleId, value]) => [styleId, readScopedOptions(value)]),
  );
}

function freezeScopedOptions(input: AppearanceScopedOptions): AppearanceScopedOptions {
  return Object.freeze(Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, Object.freeze({ ...value })]),
  ));
}

function freezeStyleSurfaceOptions(input: AppearanceStyleSurfaceOptions): AppearanceStyleSurfaceOptions {
  return Object.freeze(Object.fromEntries(
    Object.entries(input).map(([styleId, surfaces]) => [styleId, freezeScopedOptions(surfaces)]),
  ));
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return Boolean(input) && typeof input === "object" && !Array.isArray(input);
}

function asString(input: unknown): string | null {
  return typeof input === "string" ? input : null;
}
