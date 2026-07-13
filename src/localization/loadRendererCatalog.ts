import type { AppLocale, LocaleCatalog } from "@puppyone/localization/core";
import type { LocaleCatalogBundle } from "@puppyone/localization/react";

type CatalogModule = { default: LocaleCatalog };

const catalogLoaders: Record<AppLocale, () => Promise<CatalogModule>> = {
  en: () => import("./catalog-loaders/en"),
  es: () => import("./catalog-loaders/es"),
  "pt-BR": () => import("./catalog-loaders/pt-BR"),
  fr: () => import("./catalog-loaders/fr"),
  de: () => import("./catalog-loaders/de"),
  ja: () => import("./catalog-loaders/ja"),
  ko: () => import("./catalog-loaders/ko"),
  "zh-Hans": () => import("./catalog-loaders/zh-Hans"),
};

const catalogPromiseByLocale = new Map<AppLocale, Promise<LocaleCatalog>>();

export function loadRendererCatalog(locale: AppLocale): Promise<LocaleCatalog> {
  const cached = catalogPromiseByLocale.get(locale);
  if (cached) return cached;

  const pending = catalogLoaders[locale]()
    .then((module) => module.default)
    .catch((error) => {
      catalogPromiseByLocale.delete(locale);
      throw error;
    });
  catalogPromiseByLocale.set(locale, pending);
  return pending;
}

export async function loadRendererCatalogBundle(locale: AppLocale): Promise<LocaleCatalogBundle> {
  const catalog = await loadRendererCatalog(locale);
  const fallbackCatalog = locale === "en"
    ? catalog
    : await loadRendererCatalog("en");
  return Object.freeze({ catalog, fallbackCatalog });
}
