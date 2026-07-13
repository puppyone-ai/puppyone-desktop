import type { LocaleCatalog, LocaleState } from "@puppyone/localization/core";
import type { LocaleCatalogLoader, LocaleClient } from "@puppyone/localization/react";
import { loadRendererCatalog, loadRendererCatalogBundle } from "./loadRendererCatalog";
import {
  createBrowserLocaleClient,
  createElectronLocaleClient,
  createEnglishFallbackState,
  normalizeLocaleState,
  type LocalizationBridge,
} from "./localeClient";

export type RendererLocalizationBootstrap = Readonly<{
  state: LocaleState;
  catalog: LocaleCatalog;
  fallbackCatalog: LocaleCatalog;
  client: LocaleClient;
  loadCatalog: LocaleCatalogLoader;
}>;

function getLocalizationBridge(): LocalizationBridge | null {
  const bridge = window.puppyoneDesktop;
  if (
    typeof bridge?.getLocalizationBootstrap !== "function"
    || typeof bridge?.setLanguagePreference !== "function"
    || typeof bridge?.onLocaleChanged !== "function"
  ) {
    return null;
  }
  return bridge;
}

export async function bootstrapRendererLocalization(): Promise<RendererLocalizationBootstrap> {
  const bridge = getLocalizationBridge();
  let state: LocaleState;
  let client: LocaleClient;

  if (bridge) {
    state = normalizeLocaleState(await bridge.getLocalizationBootstrap());
    client = createElectronLocaleClient(bridge);
  } else {
    const browserClient = createBrowserLocaleClient();
    state = browserClient.getState();
    client = browserClient;
  }

  try {
    const bundle = await loadRendererCatalogBundle(state.locale);
    return Object.freeze({
      state,
      catalog: bundle.catalog,
      fallbackCatalog: bundle.fallbackCatalog,
      client,
      loadCatalog: loadRendererCatalogBundle,
    });
  } catch (error) {
    if (state.locale === "en") throw error;
    console.warn("Unable to load selected locale catalog; using English.", {
      locale: state.locale,
      error,
    });
    const fallbackCatalog = await loadRendererCatalog("en");
    return Object.freeze({
      state: createEnglishFallbackState(state),
      catalog: fallbackCatalog,
      fallbackCatalog,
      client,
      loadCatalog: loadRendererCatalogBundle,
    });
  }
}
