import type {
  ThemeCatalogSnapshot,
  ThemeColorMode,
  ThemeTarget,
} from "./themeTypes";

export const SURFACE_THEME_PREFERENCES_STORAGE_KEY = "puppyone.desktop.surfaceThemes";
export const CUSTOM_CSS_THEME_ID = "local.puppyone.custom-css";

export type SurfaceThemePreferences = Readonly<{
  version: 4;
  pack: string;
  customCss: Readonly<Record<ThemeTarget, boolean>>;
}>;

export type SurfaceThemeSelection = Readonly<Record<ThemeTarget, string>>;

export const DEFAULT_SURFACE_THEME_PREFERENCES: SurfaceThemePreferences = Object.freeze({
  version: 4,
  pack: "default",
  customCss: Object.freeze({ application: false, markdown: false, csv: false }),
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
    if (parsed.version === 2) return migrateVersionTwo(parsed);
    if (parsed.version === 3) return migrateVersionThree(parsed);
    if (
      parsed.version !== 4
      || !isThemeId(parsed.pack)
      || !isRecord(parsed.customCss)
    ) {
      return DEFAULT_SURFACE_THEME_PREFERENCES;
    }
    return Object.freeze({
      version: 4,
      pack: parsed.pack,
      customCss: parseCustomCss(parsed.customCss),
    });
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
  return Object.freeze({
    ...preferences,
    pack: themeId,
  });
}

export function updateCustomCssEnabled(
  preferences: SurfaceThemePreferences,
  target: ThemeTarget,
  enabled: boolean,
): SurfaceThemePreferences {
  return Object.freeze({
    ...preferences,
    customCss: freezeCustomCss({ ...preferences.customCss, [target]: enabled }),
  });
}

export function resolveSurfaceThemeSelection(
  preferences: SurfaceThemePreferences,
  snapshot: ThemeCatalogSnapshot,
  mode: ThemeColorMode,
): SurfaceThemeSelection {
  const themes = new Map(snapshot.themes.map((theme) => [theme.id, theme]));
  const requiredTargets: readonly ThemeTarget[] = ["application", "markdown", "csv"];
  const theme = themes.get(preferences.pack);
  const resolvedPack = preferences.pack !== CUSTOM_CSS_THEME_ID
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
  const selection = {
    application: isThemeId(parsed.application) ? parsed.application : "default",
    markdown: isThemeId(parsed.markdown) ? parsed.markdown : "default",
    csv: isThemeId(parsed.csv) ? parsed.csv : "default",
  };
  const customCss = {
    application: selection.application === CUSTOM_CSS_THEME_ID,
    markdown: selection.markdown === CUSTOM_CSS_THEME_ID,
    csv: selection.csv === CUSTOM_CSS_THEME_ID,
  };
  const baseSelection = {
    application: customCss.application ? "default" : selection.application,
    markdown: customCss.markdown ? "default" : selection.markdown,
    csv: customCss.csv ? "default" : selection.csv,
  };
  const values = Object.values(baseSelection);
  const sharedPack = values.every((value) => value === values[0]) ? values[0] : "default";
  return Object.freeze({
    version: 4,
    pack: sharedPack,
    customCss: freezeCustomCss(customCss),
  });
}

function migrateVersionTwo(parsed: Record<string, unknown>): SurfaceThemePreferences {
  if (!isThemeId(parsed.pack) || !isRecord(parsed.overrides)) {
    return DEFAULT_SURFACE_THEME_PREFERENCES;
  }
  const overrides = {
    application: parseOverride(parsed.overrides.application),
    markdown: parseOverride(parsed.overrides.markdown),
    csv: parseOverride(parsed.overrides.csv),
  };
  return Object.freeze({
    version: 4,
    pack: parsed.pack,
    customCss: freezeCustomCss({
      application: overrides.application === CUSTOM_CSS_THEME_ID,
      markdown: overrides.markdown === CUSTOM_CSS_THEME_ID,
      csv: overrides.csv === CUSTOM_CSS_THEME_ID,
    }),
  });
}

function migrateVersionThree(parsed: Record<string, unknown>): SurfaceThemePreferences {
  if (
    !isThemeId(parsed.pack)
    || !isRecord(parsed.overrides)
    || !isRecord(parsed.customCss)
  ) {
    return DEFAULT_SURFACE_THEME_PREFERENCES;
  }
  return Object.freeze({
    version: 4,
    pack: parsed.pack,
    customCss: parseCustomCss(parsed.customCss),
  });
}

function freezeCustomCss(
  customCss: Record<ThemeTarget, boolean>,
): SurfaceThemePreferences["customCss"] {
  return Object.freeze(customCss);
}

function parseCustomCss(value: Record<string, unknown>): SurfaceThemePreferences["customCss"] {
  return freezeCustomCss({
    application: value.application === true,
    markdown: value.markdown === true,
    csv: value.csv === true,
  });
}

function parseOverride(value: unknown) {
  return value === null || isThemeId(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
