export const LEGACY_SURFACE_THEME_PREFERENCES_STORAGE_KEY = "puppyone.desktop.surfaceThemes";
export const LEGACY_CUSTOM_CSS_THEME_ID = "local.puppyone.custom-css";

const subThemeIdPattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const RETIRED_SUB_THEME_ID_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  default: "default.neutral",
  "builtin.markdown.newsprint": "default.newspaper",
  "builtin.markdown.newspaper": "default.newspaper",
  "builtin.pack.newsprint": "default.newspaper",
  "builtin.pack.github": "default.github",
  "builtin.pack.newspaper": "default.newspaper",
});

export function isSubThemeId(value: unknown): value is string {
  return typeof value === "string" && subThemeIdPattern.test(value);
}

export function normalizeSubThemeId(value: string): string {
  return RETIRED_SUB_THEME_ID_ALIASES[value] ?? value;
}

export function readLegacySurfaceSubThemeId(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown> | null;
    if (!isRecord(parsed)) return null;
    if (parsed.version === 1) {
      const selected = [parsed.application, parsed.markdown, parsed.csv]
        .filter((candidate): candidate is string => typeof candidate === "string")
        .map(normalizeSubThemeId);
      if (selected.length === 3 && selected.every((candidate) => candidate === selected[0])) {
        return isSubThemeId(selected[0]) && selected[0] !== LEGACY_CUSTOM_CSS_THEME_ID
          ? selected[0]
          : null;
      }
      return null;
    }
    if (typeof parsed.pack !== "string") return null;
    const normalized = normalizeSubThemeId(parsed.pack);
    return isSubThemeId(normalized) && normalized !== LEGACY_CUSTOM_CSS_THEME_ID
      ? normalized
      : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
