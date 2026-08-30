import type {
  ThemeCatalogSnapshot,
  ThemeColorMode,
  ThemeTarget,
} from "./themeTypes";

export const SURFACE_THEME_PREFERENCES_STORAGE_KEY = "puppyone.desktop.surfaceThemes";
export const LEGACY_CUSTOM_CSS_THEME_ID = "local.puppyone.custom-css";

export type SurfaceThemePreferences = Readonly<{
  version: 5;
  pack: string;
}>;

export type SurfaceThemeSelection = Readonly<Record<ThemeTarget, string>>;

export const DEFAULT_SURFACE_THEME_PREFERENCES: SurfaceThemePreferences = Object.freeze({
  version: 5,
  pack: "default",
});

const themeIdPattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*){2,}$/;
const RETIRED_THEME_ID_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  "builtin.markdown.newsprint": "builtin.pack.newspaper",
  "builtin.markdown.newspaper": "builtin.pack.newspaper",
  "builtin.pack.newsprint": "builtin.pack.newspaper",
});

export function isThemeId(value: unknown): value is string {
  return value === "default" || (typeof value === "string" && themeIdPattern.test(value));
}

export function parseSurfaceThemePreferences(value: string | null | undefined): SurfaceThemePreferences {
  if (!value) return DEFAULT_SURFACE_THEME_PREFERENCES;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown> | null;
    if (!isRecord(parsed)) return DEFAULT_SURFACE_THEME_PREFERENCES;
    if (parsed.version === 1) return migrateVersionOne(parsed);
    if (parsed.version === 2 || parsed.version === 3 || parsed.version === 4) {
      return migratePackPreference(parsed);
    }
    if (parsed.version !== 5 || !isThemeId(parsed.pack)) {
      return DEFAULT_SURFACE_THEME_PREFERENCES;
    }
    return Object.freeze({ version: 5, pack: normalizeThemeId(parsed.pack) });
  } catch {
    return DEFAULT_SURFACE_THEME_PREFERENCES;
  }
}

export function serializeSurfaceThemePreferences(preferences: SurfaceThemePreferences): string {
  return JSON.stringify(preferences);
}

export function selectThemePack(
  preferences: SurfaceThemePreferences,
  themeId: string,
): SurfaceThemePreferences {
  if (!isThemeId(themeId)) return preferences;
  return Object.freeze({ ...preferences, pack: themeId });
}

export function resolveSurfaceThemeSelection(
  preferences: SurfaceThemePreferences,
  snapshot: ThemeCatalogSnapshot,
  mode: ThemeColorMode,
): SurfaceThemeSelection {
  const themes = new Map(snapshot.themes.map((theme) => [theme.id, theme]));
  const requiredTargets: readonly ThemeTarget[] = ["application", "markdown", "csv"];
  const theme = themes.get(preferences.pack);
  const resolvedPack = preferences.pack !== LEGACY_CUSTOM_CSS_THEME_ID
    && theme?.modes.includes(mode)
    && requiredTargets.every((target) => theme.targets.includes(target))
    ? theme.id
    : "default";
  return Object.freeze({
    application: resolvedPack,
    markdown: resolvedPack,
    csv: resolvedPack,
  });
}

function migrateVersionOne(parsed: Record<string, unknown>): SurfaceThemePreferences {
  const selection = [parsed.application, parsed.markdown, parsed.csv]
    .map((value) => isThemeId(value) && value !== LEGACY_CUSTOM_CSS_THEME_ID
      ? normalizeThemeId(value)
      : "default");
  const pack = selection.every((value) => value === selection[0]) ? selection[0] : "default";
  return Object.freeze({ version: 5, pack });
}

function migratePackPreference(parsed: Record<string, unknown>): SurfaceThemePreferences {
  if (!isThemeId(parsed.pack) || parsed.pack === LEGACY_CUSTOM_CSS_THEME_ID) {
    return DEFAULT_SURFACE_THEME_PREFERENCES;
  }
  return Object.freeze({ version: 5, pack: normalizeThemeId(parsed.pack) });
}

function normalizeThemeId(themeId: string): string {
  return RETIRED_THEME_ID_ALIASES[themeId] ?? themeId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
