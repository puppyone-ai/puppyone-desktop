import {
  getLocaleDescriptor,
  isSelectableAppLanguagePreference,
  resolveLocaleState,
  type AppLanguagePreference,
  type LocaleState,
} from "@puppyone/localization/core";
import type { LocaleClient } from "@puppyone/localization/react";

const BROWSER_LANGUAGE_STORAGE_KEY = "puppyone.desktop.developmentLanguage";

type LocalizationBridge = Readonly<{
  getLocalizationBootstrap: () => Promise<LocaleState>;
  setLanguagePreference: (preference: AppLanguagePreference) => Promise<LocaleState>;
  onLocaleChanged: (callback: (state: LocaleState) => void) => () => void;
}>;

function browserSystemLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return ["en"];
  return navigator.languages?.length ? navigator.languages : [navigator.language || "en"];
}

export function normalizeLocaleState(value: unknown): LocaleState {
  const candidate = value && typeof value === "object"
    ? value as Partial<LocaleState>
    : {};
  const preference = isSelectableAppLanguagePreference(candidate.preference)
    ? candidate.preference
    : "system";
  const systemLanguages = Array.isArray(candidate.systemLanguages)
    ? candidate.systemLanguages
    : browserSystemLanguages();
  return resolveLocaleState(preference, systemLanguages);
}

export function createElectronLocaleClient(bridge: LocalizationBridge): LocaleClient {
  return Object.freeze({
    async setLanguagePreference(preference) {
      return normalizeLocaleState(await bridge.setLanguagePreference(preference));
    },
    onLocaleChanged(callback) {
      return bridge.onLocaleChanged((state) => callback(normalizeLocaleState(state)));
    },
  });
}

export function createBrowserLocaleClient(): LocaleClient & { getState: () => LocaleState } {
  const listeners = new Set<(state: LocaleState) => void>();
  const readPreference = (): AppLanguagePreference => {
    const value = window.localStorage.getItem(BROWSER_LANGUAGE_STORAGE_KEY);
    return isSelectableAppLanguagePreference(value) ? value : "system";
  };
  const getState = () => resolveLocaleState(readPreference(), browserSystemLanguages());

  const onStorage = (event: StorageEvent) => {
    if (event.key !== BROWSER_LANGUAGE_STORAGE_KEY && event.key !== null) return;
    const state = getState();
    for (const listener of listeners) listener(state);
  };
  window.addEventListener("storage", onStorage);

  return Object.freeze({
    getState,
    async setLanguagePreference(preference) {
      if (!isSelectableAppLanguagePreference(preference)) {
        throw new Error("Unsupported language preference.");
      }
      window.localStorage.setItem(BROWSER_LANGUAGE_STORAGE_KEY, preference);
      const state = getState();
      for (const listener of listeners) listener(state);
      return state;
    },
    onLocaleChanged(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
  });
}

export function createEnglishFallbackState(state: LocaleState): LocaleState {
  return Object.freeze({
    ...state,
    locale: "en",
    direction: getLocaleDescriptor("en").direction,
  });
}

export type { LocalizationBridge };
