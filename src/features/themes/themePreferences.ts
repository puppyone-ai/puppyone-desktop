import type {
  ThemeCatalogSnapshot,
  ThemeColorMode,
  ThemeTarget,
} from "./themeTypes";

export const SURFACE_THEME_PREFERENCES_STORAGE_KEY = "puppyone.desktop.surfaceThemes";
export const CUSTOM_CSS_THEME_ID = "local.puppyone.custom-css";

export type SurfaceThemePreferences = Readonly<{
  version: 2;
  pack: string;
  overrides: Readonly<Record<ThemeTarget, string | null>>;
}>;

export type SurfaceThemeSelection = Readonly<Record<ThemeTarget, string>>;

export const DEFAULT_SURFACE_THEME_PREFERENCES: SurfaceThemePreferences = Object.freeze({
  version: 2,
  pack: "default",
  overrides: Object.freeze({ application: null, markdown: null, csv: null }),
});

const themeIdPattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*){2,}$/;

export function isThemeId(value: unknown): value is string {
  return value === "default" || (typeof value === "string" && themeIdPattern.test(value));
}

export function parseSurfaceThemePreferences(value: string | null | undefined): SurfaceThemePreferences {
  if (!value) return DEFAULT_SURFACE_THEME_PREFERENCES;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return DEFAULT_SURFACE_THEME_PREFERENCES;
    }
    if (parsed.version === 1) return migrateVersionOne(parsed);
    if (parsed.version !== 2 || !isThemeId(parsed.pack) || !isRecord(parsed.overrides)) {
      return DEFAULT_SURFACE_THEME_PREFERENCES;
    }
    return Object.freeze({
      version: 2,
      pack: parsed.pack,
      overrides: freezeOverrides({
        application: parseOverride(parsed.overrides.application),
        markdown: parseOverride(parsed.overrides.markdown),
        csv: parseOverride(parsed.overrides.csv),
      }),
    });
  } catch {
    return DEFAULT_SURFACE_THEME_PREFERENCES;
  }
}

export function serializeSurfaceThemePreferences(preferences: SurfaceThemePreferences): string {
  return JSON.stringify(preferences);
}

export function updateSurfaceThemePreference(
  preferences: SurfaceThemePreferences,
  target: ThemeTarget,
  themeId: string,
): SurfaceThemePreferences {
  return updateSurfaceThemeOverride(preferences, target, themeId);
}

export function selectThemePack(
  preferences: SurfaceThemePreferences,
  themeId: string,
): SurfaceThemePreferences {
  if (!isThemeId(themeId)) return preferences;
  return Object.freeze({
    ...preferences,
    pack: themeId,
    overrides: freezeOverrides({ application: null, markdown: null, csv: null }),
  });
}

export function updateSurfaceThemeOverride(
  preferences: SurfaceThemePreferences,
  target: ThemeTarget,
  themeId: string | null,
): SurfaceThemePreferences {
  if (themeId !== null && !isThemeId(themeId)) return preferences;
  return Object.freeze({
    ...preferences,
    overrides: freezeOverrides({ ...preferences.overrides, [target]: themeId }),
  });
}

export function resolveSurfaceThemeSelection(
  preferences: SurfaceThemePreferences,
  snapshot: ThemeCatalogSnapshot,
  mode: ThemeColorMode,
): SurfaceThemeSelection {
  const themes = new Map(snapshot.themes.map((theme) => [theme.id, theme]));
  const resolves = (themeId: string | null, target: ThemeTarget) => {
    if (!themeId) return null;
    const theme = themes.get(themeId);
    return theme?.targets.includes(target) && theme.modes.includes(mode) ? theme.id : null;
  };
  const resolveTarget = (target: ThemeTarget) => (
    resolves(preferences.overrides[target], target)
    ?? resolves(preferences.pack, target)
    ?? "default"
  );
  return Object.freeze({
    application: resolveTarget("application"),
    markdown: resolveTarget("markdown"),
    csv: resolveTarget("csv"),
  });
}

function migrateVersionOne(parsed: Record<string, unknown>): SurfaceThemePreferences {
  const selection = {
    application: isThemeId(parsed.application) ? parsed.application : "default",
    markdown: isThemeId(parsed.markdown) ? parsed.markdown : "default",
    csv: isThemeId(parsed.csv) ? parsed.csv : "default",
  };
  const values = Object.values(selection);
  const sharedPack = values.every((value) => value === values[0]) ? values[0] : "default";
  return Object.freeze({
    version: 2,
    pack: sharedPack,
    overrides: freezeOverrides({
      application: selection.application === sharedPack ? null : selection.application,
      markdown: selection.markdown === sharedPack ? null : selection.markdown,
      csv: selection.csv === sharedPack ? null : selection.csv,
    }),
  });
}

function freezeOverrides(
  overrides: Record<ThemeTarget, string | null>,
): SurfaceThemePreferences["overrides"] {
  return Object.freeze(overrides);
}

function parseOverride(value: unknown) {
  return value === null || isThemeId(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
