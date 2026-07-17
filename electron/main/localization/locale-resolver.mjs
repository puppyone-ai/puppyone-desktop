export function canonicalizeLanguageTag(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return Intl.getCanonicalLocales(value.trim())[0] ?? null;
  } catch {
    return null;
  }
}

function languageOf(tag) {
  try {
    return new Intl.Locale(tag).language;
  } catch {
    return null;
  }
}

function maximizedScriptOf(tag) {
  try {
    return new Intl.Locale(tag).maximize().script ?? null;
  } catch {
    return null;
  }
}

export function validateLocaleManifest(raw) {
  if (!raw || raw.version !== 1 || raw.defaultLocale !== "en" || !Array.isArray(raw.locales)) {
    throw new Error("Invalid PuppyOne locale manifest.");
  }
  const locales = raw.locales.map((entry) => {
    if (
      !entry
      || !canonicalizeLanguageTag(entry.locale)
      || typeof entry.label !== "string"
      || !entry.label.trim()
      || (entry.direction !== "ltr" && entry.direction !== "rtl")
    ) {
      throw new Error("Locale manifest contains an invalid descriptor.");
    }
    return Object.freeze({
      locale: entry.locale,
      label: entry.label,
      direction: entry.direction,
      aliases: Object.freeze(Array.isArray(entry.aliases) ? [...entry.aliases] : []),
      matchLanguage: entry.matchLanguage === true,
      ...(typeof entry.matchScript === "string" ? { matchScript: entry.matchScript } : {}),
      productionReady: entry.productionReady === true,
    });
  });
  const ids = locales.map((entry) => entry.locale);
  if (ids.length !== 8 || new Set(ids).size !== ids.length || !ids.includes(raw.defaultLocale)) {
    throw new Error("Locale manifest must contain eight unique locales including English.");
  }
  if (!locales.find((entry) => entry.locale === raw.defaultLocale)?.productionReady) {
    throw new Error("The final English locale fallback must be production-ready.");
  }
  return Object.freeze({
    version: 1,
    defaultLocale: raw.defaultLocale,
    locales: Object.freeze(locales),
  });
}

export function isAppLanguagePreference(manifest, value) {
  return value === "system" || manifest.locales.some((entry) => (
    entry.productionReady && entry.locale === value
  ));
}

export function normalizeSystemLanguages(values) {
  const result = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const canonical = canonicalizeLanguageTag(value);
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    result.push(canonical);
  }
  return Object.freeze(result);
}

export function resolveSystemLocale(manifest, rawSystemLanguages) {
  const exactMatches = new Map();
  for (const descriptor of manifest.locales.filter((entry) => entry.productionReady)) {
    exactMatches.set(canonicalizeLanguageTag(descriptor.locale), descriptor.locale);
    for (const alias of descriptor.aliases) {
      const canonicalAlias = canonicalizeLanguageTag(alias);
      if (canonicalAlias) exactMatches.set(canonicalAlias, descriptor.locale);
    }
  }

  for (const candidate of normalizeSystemLanguages(rawSystemLanguages)) {
    const exact = exactMatches.get(candidate);
    if (exact) return exact;
    const language = languageOf(candidate);
    if (!language) continue;
    for (const descriptor of manifest.locales) {
      if (!descriptor.productionReady) continue;
      if (descriptor.matchLanguage && languageOf(descriptor.locale) === language) {
        return descriptor.locale;
      }
      if (
        descriptor.matchScript
        && languageOf(descriptor.locale) === language
        && maximizedScriptOf(candidate) === descriptor.matchScript
      ) {
        return descriptor.locale;
      }
    }
  }
  return manifest.defaultLocale;
}

export function resolveLocaleState(manifest, preferenceValue, rawSystemLanguages) {
  const preference = isAppLanguagePreference(manifest, preferenceValue)
    ? preferenceValue
    : "system";
  const systemLanguages = normalizeSystemLanguages(rawSystemLanguages);
  const locale = preference === "system"
    ? resolveSystemLocale(manifest, systemLanguages)
    : preference;
  const descriptor = manifest.locales.find((entry) => entry.locale === locale);
  if (!descriptor) throw new Error("Resolved locale is absent from the locale manifest.");
  return Object.freeze({
    preference,
    locale,
    direction: descriptor.direction,
    systemLanguages,
  });
}
