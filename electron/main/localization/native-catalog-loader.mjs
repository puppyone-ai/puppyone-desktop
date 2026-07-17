import fs from "node:fs";
import path from "node:path";
import { IntlMessageFormat } from "intl-messageformat";
import { validateLocaleManifest } from "./locale-resolver.mjs";

async function readJson(filePath, fsModule) {
  return JSON.parse(await fsModule.promises.readFile(filePath, "utf8"));
}

function validateCatalog(value, locale) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Native locale catalog ${locale} is invalid.`);
  }
  const catalog = Object.create(null);
  for (const [messageId, message] of Object.entries(value)) {
    if (typeof message !== "string" || !message.length) {
      throw new Error(`Native locale message ${messageId} in ${locale} is invalid.`);
    }
    catalog[messageId] = message;
  }
  return Object.freeze(catalog);
}

export async function loadLocaleManifest(localesRoot, fsModule = fs) {
  return validateLocaleManifest(await readJson(path.join(localesRoot, "manifest.json"), fsModule));
}

export async function loadNativeCatalogBundle(localesRoot, locale, fsModule = fs) {
  const catalog = validateCatalog(
    await readJson(path.join(localesRoot, "native", `${locale}.json`), fsModule),
    locale,
  );
  const fallbackCatalog = locale === "en"
    ? catalog
    : validateCatalog(
        await readJson(path.join(localesRoot, "native", "en.json"), fsModule),
        "en",
      );
  return Object.freeze({ catalog, fallbackCatalog });
}

export function createNativeTranslator({ locale, catalog, fallbackCatalog, logger = console }) {
  const compiled = new Map();
  const reported = new Set();
  const compile = (messageId, source, messageLocale) => {
    const key = `${messageLocale}:${messageId}:${source}`;
    if (!compiled.has(key)) {
      compiled.set(key, new IntlMessageFormat(source, messageLocale, undefined, { ignoreTag: true }));
    }
    return compiled.get(key);
  };

  return (messageId, values = {}) => {
    const localizedSource = catalog[messageId];
    const fallbackSource = fallbackCatalog[messageId];
    const source = localizedSource ?? fallbackSource;
    if (!source) {
      if (!reported.has(messageId)) {
        reported.add(messageId);
        logger.warn(`Missing native localization message: ${messageId}`);
      }
      return fallbackCatalog["native.messageUnavailable"] ?? "";
    }
    try {
      const result = compile(messageId, source, localizedSource ? locale : "en").format(values);
      return Array.isArray(result) ? result.join("") : String(result);
    } catch (error) {
      logger.warn(`Unable to format native localization message: ${messageId}`, error);
      if (source !== fallbackSource && fallbackSource) {
        const result = compile(messageId, fallbackSource, "en").format(values);
        return Array.isArray(result) ? result.join("") : String(result);
      }
      return fallbackCatalog["native.messageUnavailable"] ?? "";
    }
  };
}
