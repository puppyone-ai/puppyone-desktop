import type { ThemeTarget } from "./themeTypes";

export const SURFACE_THEME_PREFERENCES_STORAGE_KEY = "puppyone.desktop.surfaceThemes";

export type SurfaceThemePreferences = Readonly<{
  version: 1;
  application: string;
  markdown: string;
  csv: string;
}>;

export const DEFAULT_SURFACE_THEME_PREFERENCES: SurfaceThemePreferences = Object.freeze({
  version: 1,
  application: "default",
  markdown: "default",
  csv: "default",
});

const themeIdPattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*){2,}$/;

export function isThemeId(value: unknown): value is string {
  return value === "default" || (typeof value === "string" && themeIdPattern.test(value));
}

export function parseSurfaceThemePreferences(value: string | null | undefined): SurfaceThemePreferences {
  if (!value) return DEFAULT_SURFACE_THEME_PREFERENCES;
  try {
    const parsed = JSON.parse(value) as Partial<SurfaceThemePreferences> | null;
    if (!parsed || typeof parsed !== "object" || parsed.version !== 1) {
      return DEFAULT_SURFACE_THEME_PREFERENCES;
    }
    return Object.freeze({
      version: 1,
      application: isThemeId(parsed.application) ? parsed.application : "default",
      markdown: isThemeId(parsed.markdown) ? parsed.markdown : "default",
      csv: isThemeId(parsed.csv) ? parsed.csv : "default",
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
  if (!isThemeId(themeId)) return preferences;
  return Object.freeze({ ...preferences, [target]: themeId });
}
