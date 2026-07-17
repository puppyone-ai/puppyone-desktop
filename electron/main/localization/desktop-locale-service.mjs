import fs from "node:fs";
import path from "node:path";
import { createLocalePreferenceStore } from "./locale-preference-store.mjs";
import {
  createNativeTranslator,
  loadLocaleManifest,
  loadNativeCatalogBundle,
} from "./native-catalog-loader.mjs";
import {
  isAppLanguagePreference,
  resolveLocaleState,
} from "./locale-resolver.mjs";

function statesEqual(left, right) {
  return left.preference === right.preference
    && left.locale === right.locale
    && left.direction === right.direction
    && left.systemLanguages.length === right.systemLanguages.length
    && left.systemLanguages.every((value, index) => value === right.systemLanguages[index]);
}

export function createDesktopLocaleService({
  app,
  getWindows,
  localesRoot = path.join(app.getAppPath(), "locales"),
  preferenceFilePath = path.join(app.getPath("userData"), "desktop-locale-preference.json"),
  fsModule = fs,
  logger = console,
}) {
  if (!app || typeof app.getPreferredSystemLanguages !== "function") {
    throw new TypeError("An Electron app locale authority is required.");
  }
  if (typeof getWindows !== "function") throw new TypeError("getWindows must be a function.");

  const preferenceStore = createLocalePreferenceStore({ filePath: preferenceFilePath, fsModule });
  const listeners = new Set();
  let manifest = null;
  let state = null;
  let translate = () => "";
  let initializationPromise = null;
  let mutationQueue = Promise.resolve();

  const readSystemLanguages = () => {
    try {
      const values = app.getPreferredSystemLanguages();
      if (Array.isArray(values) && values.length) return values;
    } catch (error) {
      logger.warn("Unable to read preferred system languages.", error);
    }
    try {
      return [app.getLocale()];
    } catch {
      return ["en"];
    }
  };

  const snapshot = () => {
    if (!state) throw new Error("Desktop locale service has not been initialized.");
    return {
      preference: state.preference,
      locale: state.locale,
      direction: state.direction,
      systemLanguages: [...state.systemLanguages],
    };
  };

  const broadcast = () => {
    const payload = snapshot();
    for (const window of getWindows()) {
      if (window?.isDestroyed?.() || window?.webContents?.isDestroyed?.()) continue;
      window.webContents.send("localization:changed", payload);
    }
  };

  const commit = (nextState, bundle, shouldBroadcast) => {
    state = nextState;
    translate = createNativeTranslator({
      locale: nextState.locale,
      catalog: bundle.catalog,
      fallbackCatalog: bundle.fallbackCatalog,
      logger,
    });
    if (shouldBroadcast) broadcast();
    const payload = snapshot();
    for (const listener of listeners) listener(payload);
    return payload;
  };

  const serialize = (operation) => {
    const next = mutationQueue.then(operation, operation);
    mutationQueue = next.catch(() => undefined);
    return next;
  };

  const initialize = async () => {
    if (state) return snapshot();
    if (!initializationPromise) {
      initializationPromise = (async () => {
        manifest = await loadLocaleManifest(localesRoot, fsModule);
        const storedPreference = await preferenceStore.read();
        const preference = isAppLanguagePreference(manifest, storedPreference)
          ? storedPreference
          : "system";
        const nextState = resolveLocaleState(manifest, preference, readSystemLanguages());
        const bundle = await loadNativeCatalogBundle(localesRoot, nextState.locale, fsModule);
        return commit(nextState, bundle, false);
      })().catch((error) => {
        initializationPromise = null;
        throw error;
      });
    }
    return initializationPromise;
  };

  return Object.freeze({
    initialize,
    getSnapshot: snapshot,
    t(messageId, values) {
      if (!state) throw new Error("Desktop locale service has not been initialized.");
      return translate(messageId, values);
    },
    setLanguagePreference(preference) {
      return serialize(async () => {
        await initialize();
        if (!isAppLanguagePreference(manifest, preference)) {
          throw new TypeError("Unsupported application language preference.");
        }
        const nextState = resolveLocaleState(manifest, preference, readSystemLanguages());
        if (statesEqual(state, nextState)) return snapshot();
        const bundle = await loadNativeCatalogBundle(localesRoot, nextState.locale, fsModule);
        await preferenceStore.write(preference);
        return commit(nextState, bundle, true);
      });
    },
    refreshSystemLanguages() {
      return serialize(async () => {
        await initialize();
        if (state.preference !== "system") return snapshot();
        const nextState = resolveLocaleState(manifest, "system", readSystemLanguages());
        if (statesEqual(state, nextState)) return snapshot();
        const bundle = nextState.locale === state.locale
          ? await loadNativeCatalogBundle(localesRoot, state.locale, fsModule)
          : await loadNativeCatalogBundle(localesRoot, nextState.locale, fsModule);
        return commit(nextState, bundle, true);
      });
    },
    onDidChange(listener) {
      if (typeof listener !== "function") throw new TypeError("Locale listener must be a function.");
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      listeners.clear();
    },
  });
}
