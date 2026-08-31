export const TYPOGRAPHY_PREFERENCE_VERSION = 3 as const;
export const THEME_CONTENT_FONT_ID = "theme" as const;

export type TypographyRole = "ui" | "content" | "code" | "terminal";
export type FontSourceKind = "bundled" | "system" | "imported";
export type FontCategory = "sans" | "serif" | "monospace";

export type FontCatalogEntry = Readonly<{
  id: string;
  label: string;
  description: string;
  /** Trusted primary family expression. Locale and Emoji fallbacks are product-owned. */
  family: string;
  category: FontCategory;
  source: FontSourceKind;
  roles: readonly TypographyRole[];
}>;

export type TypographyPreferences = Readonly<{
  version: typeof TYPOGRAPHY_PREFERENCE_VERSION;
  contentFontId: string;
  codeFontId: string;
  terminalFontId: string;
}>;

export type ResolvedTypography = Readonly<{
  ui: FontCatalogEntry;
  content: FontCatalogEntry;
  editorContentOverride: FontCatalogEntry | null;
  code: FontCatalogEntry;
  terminal: FontCatalogEntry;
}>;

export const BUILTIN_FONT_IDS = {
  geistSans: "builtin:geist-sans",
  geistMono: "builtin:geist-mono",
  systemSans: "builtin:system-sans",
  systemSerif: "builtin:system-serif",
  terminalSystemMono: "builtin:terminal-system-mono",
} as const;

export const BUILTIN_FONT_CATALOG = [
  {
    id: BUILTIN_FONT_IDS.geistSans,
    label: "Geist",
    description: "PuppyOne's balanced default reading font.",
    family: "\"Geist Sans\"",
    category: "sans",
    source: "bundled",
    roles: ["ui", "content"],
  },
  {
    id: BUILTIN_FONT_IDS.systemSans,
    label: "System",
    description: "Use the native sans-serif font from this device.",
    family: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\"",
    category: "sans",
    source: "system",
    roles: ["ui", "content"],
  },
  {
    id: BUILTIN_FONT_IDS.systemSerif,
    label: "Serif",
    description: "A quiet system serif stack for long-form reading.",
    family: "ui-serif, \"New York\", \"Iowan Old Style\", \"Palatino Linotype\", Palatino, Georgia",
    category: "serif",
    source: "system",
    roles: ["content"],
  },
  {
    id: BUILTIN_FONT_IDS.geistMono,
    label: "Geist Mono",
    description: "PuppyOne's metric-stable code font.",
    family: "\"Geist Mono\"",
    category: "monospace",
    source: "bundled",
    roles: ["code"],
  },
  {
    id: BUILTIN_FONT_IDS.terminalSystemMono,
    label: "Terminal Mono",
    description: "The metric-stable native terminal stack.",
    family: "\"SF Mono\", \"SFMono-Regular\", Menlo, Monaco, Consolas, \"Liberation Mono\"",
    category: "monospace",
    source: "system",
    roles: ["terminal"],
  },
] as const satisfies readonly FontCatalogEntry[];

export const DEFAULT_TYPOGRAPHY_PREFERENCES: TypographyPreferences = Object.freeze({
  version: TYPOGRAPHY_PREFERENCE_VERSION,
  contentFontId: THEME_CONTENT_FONT_ID,
  codeFontId: BUILTIN_FONT_IDS.geistMono,
  terminalFontId: BUILTIN_FONT_IDS.terminalSystemMono,
});

type TypographyPreferenceRole = Exclude<TypographyRole, "ui">;

const DEFAULT_FONT_ID_BY_ROLE: Readonly<Record<TypographyPreferenceRole, string>> = {
  content: DEFAULT_TYPOGRAPHY_PREFERENCES.contentFontId,
  code: DEFAULT_TYPOGRAPHY_PREFERENCES.codeFontId,
  terminal: DEFAULT_TYPOGRAPHY_PREFERENCES.terminalFontId,
};

const PRODUCT_FONT_ID_BY_ROLE: Readonly<Record<TypographyRole, string>> = {
  ui: BUILTIN_FONT_IDS.geistSans,
  content: BUILTIN_FONT_IDS.geistSans,
  code: BUILTIN_FONT_IDS.geistMono,
  terminal: BUILTIN_FONT_IDS.terminalSystemMono,
};

const FONT_ID_PATTERN = /^[a-z][a-z0-9-]{0,31}:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function getFontCatalogEntries(
  role: TypographyRole,
  catalog: readonly FontCatalogEntry[] = BUILTIN_FONT_CATALOG,
) {
  return catalog.filter((entry) => entry.roles.includes(role));
}

export function isValidFontCatalogEntry(value: unknown): value is FontCatalogEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<FontCatalogEntry>;
  return typeof entry.id === "string"
    && FONT_ID_PATTERN.test(entry.id)
    && typeof entry.label === "string"
    && entry.label.trim().length > 0
    && typeof entry.description === "string"
    && typeof entry.family === "string"
    && entry.family.trim().length > 0
    && entry.family.length <= 1024
    && !/[\u0000-\u001f\u007f;{}]/.test(entry.family)
    && !/(?:url|var|env|attr|calc)\s*\(/i.test(entry.family)
    && (entry.category === "sans" || entry.category === "serif" || entry.category === "monospace")
    && (entry.source === "bundled" || entry.source === "system" || entry.source === "imported")
    && Array.isArray(entry.roles)
    && entry.roles.length > 0
    && entry.roles.every((role) => (
      role === "ui" || role === "content" || role === "code" || role === "terminal"
    ));
}

/** Builds a preview/isolated family without duplicating locale fallback lists in TS. */
export function createCatalogFontFamily(entry: FontCatalogEntry) {
  const localeToken = entry.category === "monospace"
    ? "--po-font-locale-mono"
    : `--po-font-locale-${entry.category}`;
  const generic = entry.category === "monospace"
    ? "monospace"
    : entry.category === "sans"
      ? "sans-serif"
      : "serif";
  return `${entry.family}, var(${localeToken}), var(--po-font-emoji), ${generic}`;
}

export function parseTypographyPreferences(value: string | null | undefined): TypographyPreferences {
  if (!value) return DEFAULT_TYPOGRAPHY_PREFERENCES;
  try {
    const parsed = JSON.parse(value) as (
      Partial<Omit<TypographyPreferences, "version">> & { version?: unknown }
    ) | null;
    if (!parsed || typeof parsed !== "object") return DEFAULT_TYPOGRAPHY_PREFERENCES;
    const contentFontId = normalizeFontId(parsed.contentFontId, "content");
    return Object.freeze({
      version: TYPOGRAPHY_PREFERENCE_VERSION,
      contentFontId: (
        (parsed.version === 1 || parsed.version === 2 || parsed.version === undefined)
        && contentFontId === BUILTIN_FONT_IDS.geistSans
      )
        ? THEME_CONTENT_FONT_ID
        : contentFontId,
      codeFontId: normalizeFontId(parsed.codeFontId, "code"),
      terminalFontId: normalizeFontId(parsed.terminalFontId, "terminal"),
    });
  } catch {
    return DEFAULT_TYPOGRAPHY_PREFERENCES;
  }
}

export function resolveTypography(
  preferences: TypographyPreferences,
  catalog: readonly FontCatalogEntry[] = BUILTIN_FONT_CATALOG,
): ResolvedTypography {
  return Object.freeze({
    ui: resolveFontForRole(PRODUCT_FONT_ID_BY_ROLE.ui, "ui", catalog),
    content: resolveFontForRole(PRODUCT_FONT_ID_BY_ROLE.content, "content", catalog),
    editorContentOverride: preferences.contentFontId === THEME_CONTENT_FONT_ID
      ? null
      : resolveFontForRole(preferences.contentFontId, "content", catalog),
    code: resolveFontForRole(preferences.codeFontId, "code", catalog),
    terminal: resolveFontForRole(preferences.terminalFontId, "terminal", catalog),
  });
}

export function withTypographyFont(
  preferences: TypographyPreferences,
  role: TypographyPreferenceRole,
  fontId: string,
): TypographyPreferences {
  const normalizedId = normalizeFontId(fontId, role);
  return Object.freeze({
    ...preferences,
    version: TYPOGRAPHY_PREFERENCE_VERSION,
    ...(role === "content" ? { contentFontId: normalizedId } : {}),
    ...(role === "code" ? { codeFontId: normalizedId } : {}),
    ...(role === "terminal" ? { terminalFontId: normalizedId } : {}),
  });
}

function resolveFontForRole(
  requestedId: string,
  role: TypographyRole,
  catalog: readonly FontCatalogEntry[],
) {
  const requested = catalog.find((entry) => entry.id === requestedId && entry.roles.includes(role));
  if (requested) return requested;

  const fallbackId = PRODUCT_FONT_ID_BY_ROLE[role];
  const fallback = catalog.find((entry) => entry.id === fallbackId && entry.roles.includes(role));
  if (fallback) return fallback;

  const firstCompatible = catalog.find((entry) => entry.roles.includes(role));
  if (firstCompatible) return firstCompatible;
  throw new Error(`Font catalog has no ${role} font.`);
}

function normalizeFontId(value: unknown, role: TypographyPreferenceRole) {
  if (typeof value !== "string") return DEFAULT_FONT_ID_BY_ROLE[role];
  const normalized = value.trim();
  if (role === "content" && normalized === THEME_CONTENT_FONT_ID) return normalized;
  return FONT_ID_PATTERN.test(normalized) ? normalized : DEFAULT_FONT_ID_BY_ROLE[role];
}
