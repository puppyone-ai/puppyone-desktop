export const TYPOGRAPHY_PREFERENCE_VERSION = 1 as const;

export type TypographyRole = "ui" | "content" | "code" | "terminal";
export type FontSourceKind = "bundled" | "system" | "imported";

export type FontCatalogEntry = Readonly<{
  id: string;
  label: string;
  description: string;
  family: string;
  source: FontSourceKind;
  roles: readonly TypographyRole[];
}>;

export type TypographyPreferences = Readonly<{
  version: typeof TYPOGRAPHY_PREFERENCE_VERSION;
  uiFontId: string;
  contentFontId: string;
  codeFontId: string;
  terminalFontId: string;
}>;

export type ResolvedTypography = Readonly<{
  ui: FontCatalogEntry;
  content: FontCatalogEntry;
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
    family: "\"Geist Sans\", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
    source: "bundled",
    roles: ["ui", "content"],
  },
  {
    id: BUILTIN_FONT_IDS.systemSans,
    label: "System",
    description: "Use the native sans-serif font from this device.",
    family: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
    source: "system",
    roles: ["ui", "content"],
  },
  {
    id: BUILTIN_FONT_IDS.systemSerif,
    label: "Serif",
    description: "A quiet system serif stack for long-form reading.",
    family: "ui-serif, \"New York\", \"Iowan Old Style\", \"Palatino Linotype\", Palatino, Georgia, serif",
    source: "system",
    roles: ["content"],
  },
  {
    id: BUILTIN_FONT_IDS.geistMono,
    label: "Geist Mono",
    description: "PuppyOne's metric-stable code font.",
    family: "\"Geist Mono\", \"SFMono-Regular\", \"SF Mono\", Consolas, \"Liberation Mono\", monospace",
    source: "bundled",
    roles: ["code"],
  },
  {
    id: BUILTIN_FONT_IDS.terminalSystemMono,
    label: "Terminal Mono",
    description: "The metric-stable native terminal stack.",
    family: "\"SF Mono\", \"SFMono-Regular\", Menlo, Monaco, Consolas, \"Liberation Mono\", monospace",
    source: "system",
    roles: ["terminal"],
  },
] as const satisfies readonly FontCatalogEntry[];

export const DEFAULT_TYPOGRAPHY_PREFERENCES: TypographyPreferences = Object.freeze({
  version: TYPOGRAPHY_PREFERENCE_VERSION,
  uiFontId: BUILTIN_FONT_IDS.geistSans,
  contentFontId: BUILTIN_FONT_IDS.geistSans,
  codeFontId: BUILTIN_FONT_IDS.geistMono,
  terminalFontId: BUILTIN_FONT_IDS.terminalSystemMono,
});

const DEFAULT_FONT_ID_BY_ROLE: Readonly<Record<TypographyRole, string>> = {
  ui: DEFAULT_TYPOGRAPHY_PREFERENCES.uiFontId,
  content: DEFAULT_TYPOGRAPHY_PREFERENCES.contentFontId,
  code: DEFAULT_TYPOGRAPHY_PREFERENCES.codeFontId,
  terminal: DEFAULT_TYPOGRAPHY_PREFERENCES.terminalFontId,
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
    && !/url\s*\(/i.test(entry.family)
    && (entry.source === "bundled" || entry.source === "system" || entry.source === "imported")
    && Array.isArray(entry.roles)
    && entry.roles.length > 0
    && entry.roles.every((role) => (
      role === "ui" || role === "content" || role === "code" || role === "terminal"
    ));
}

export function parseTypographyPreferences(value: string | null | undefined): TypographyPreferences {
  if (!value) return DEFAULT_TYPOGRAPHY_PREFERENCES;
  try {
    const parsed = JSON.parse(value) as Partial<TypographyPreferences> | null;
    if (!parsed || typeof parsed !== "object") return DEFAULT_TYPOGRAPHY_PREFERENCES;
    return Object.freeze({
      version: TYPOGRAPHY_PREFERENCE_VERSION,
      uiFontId: normalizeFontId(parsed.uiFontId, "ui"),
      contentFontId: normalizeFontId(parsed.contentFontId, "content"),
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
    ui: resolveFontForRole(preferences.uiFontId, "ui", catalog),
    content: resolveFontForRole(preferences.contentFontId, "content", catalog),
    code: resolveFontForRole(preferences.codeFontId, "code", catalog),
    terminal: resolveFontForRole(preferences.terminalFontId, "terminal", catalog),
  });
}

export function withTypographyFont(
  preferences: TypographyPreferences,
  role: TypographyRole,
  fontId: string,
): TypographyPreferences {
  const normalizedId = normalizeFontId(fontId, role);
  return Object.freeze({
    ...preferences,
    version: TYPOGRAPHY_PREFERENCE_VERSION,
    ...(role === "ui" ? { uiFontId: normalizedId } : {}),
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

  const fallbackId = DEFAULT_FONT_ID_BY_ROLE[role];
  const fallback = catalog.find((entry) => entry.id === fallbackId && entry.roles.includes(role));
  if (fallback) return fallback;

  const firstCompatible = catalog.find((entry) => entry.roles.includes(role));
  if (firstCompatible) return firstCompatible;
  throw new Error(`Font catalog has no ${role} font.`);
}

function normalizeFontId(value: unknown, role: TypographyRole) {
  if (typeof value !== "string") return DEFAULT_FONT_ID_BY_ROLE[role];
  const normalized = value.trim();
  return FONT_ID_PATTERN.test(normalized) ? normalized : DEFAULT_FONT_ID_BY_ROLE[role];
}
