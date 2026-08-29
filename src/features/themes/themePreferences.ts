import type {
  ThemeCatalogSnapshot,
  ThemeColorMode,
  ThemeTarget,
} from "./themeTypes";

export const SURFACE_THEME_PREFERENCES_STORAGE_KEY = "puppyone.desktop.surfaceThemes";
export const CUSTOM_CSS_THEME_ID = "local.puppyone.custom-css";

export type SurfaceThemePreferences = Readonly<{
  version: 3;
  pack: string;
  overrides: Readonly<Record<ThemeTarget, string | null>>;
  customCss: Readonly<Record<ThemeTarget, boolean>>;
}>;

export type SurfaceThemeSelection = Readonly<Record<ThemeTarget, string>>;

export const DEFAULT_SURFACE_THEME_PREFERENCES: SurfaceThemePreferences = Object.freeze({
  version: 3,
  pack: "default",
  overrides: Object.freeze({ application: null, markdown: null, csv: null }),
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
    if (
      parsed.version !== 3
      || !isThemeId(parsed.pack)
      || !isRecord(parsed.overrides)
      || !isRecord(parsed.customCss)
    ) {
      return DEFAULT_SURFACE_THEME_PREFERENCES;
    }
    return Object.freeze({
      version: 3,
      pack: parsed.pack,
      overrides: freezeOverrides({
        application: parseOverride(parsed.overrides.application),
        markdown: parseOverride(parsed.overrides.markdown),
        csv: parseOverride(parsed.overrides.csv),
      }),
      customCss: freezeCustomCss({
        application: parsed.customCss.application === true,
        markdown: parsed.customCss.markdown === true,
        csv: parsed.customCss.csv === true,
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
  if (themeId !== null && (!isThemeId(themeId) || themeId === CUSTOM_CSS_THEME_ID)) return preferences;
  return Object.freeze({
    ...preferences,
    overrides: freezeOverrides({ ...preferences.overrides, [target]: themeId }),
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
  const resolves = (themeId: string | null, target: ThemeTarget) => {
    if (!themeId || themeId === CUSTOM_CSS_THEME_ID) return null;
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
    version: 3,
    pack: sharedPack,
    overrides: freezeOverrides({
      application: baseSelection.application === sharedPack ? null : baseSelection.application,
      markdown: baseSelection.markdown === sharedPack ? null : baseSelection.markdown,
      csv: baseSelection.csv === sharedPack ? null : baseSelection.csv,
    }),
    customCss: freezeCustomCss(customCss),
  });
}

function migrateVersionTwo(parsed: Record<string, unknown>): SurfaceThemePreferences {
  if (!isThemeId(parsed.pack) || !isRecord(parsed.overrides)) {
    return DEFAULT_SURFACE_THEME_PREFERENCES;
  }
  return createMigratedPreferences({
    pack: parsed.pack,
    overrides: {
      application: parseOverride(parsed.overrides.application),
      markdown: parseOverride(parsed.overrides.markdown),
      csv: parseOverride(parsed.overrides.csv),
    },
  });
}

function createMigratedPreferences({
  pack,
  overrides,
}: {
  pack: string;
  overrides: Record<ThemeTarget, string | null>;
}): SurfaceThemePreferences {
  const customCss = {
    application: overrides.application === CUSTOM_CSS_THEME_ID,
    markdown: overrides.markdown === CUSTOM_CSS_THEME_ID,
    csv: overrides.csv === CUSTOM_CSS_THEME_ID,
  };
  return Object.freeze({
    version: 3,
    pack,
    overrides: freezeOverrides({
      application: customCss.application ? null : overrides.application,
      markdown: customCss.markdown ? null : overrides.markdown,
      csv: customCss.csv ? null : overrides.csv,
    }),
    customCss: freezeCustomCss(customCss),
  });
}

function freezeOverrides(
  overrides: Record<ThemeTarget, string | null>,
): SurfaceThemePreferences["overrides"] {
  return Object.freeze(overrides);
}

function freezeCustomCss(
  customCss: Record<ThemeTarget, boolean>,
): SurfaceThemePreferences["customCss"] {
  return Object.freeze(customCss);
}

function parseOverride(value: unknown) {
  return value === null || isThemeId(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
