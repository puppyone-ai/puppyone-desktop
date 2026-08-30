// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SURFACE_THEME_PREFERENCES_STORAGE_KEY,
  type SurfaceThemePreferences,
} from "../src/features/themes/themePreferences";
import { APPEARANCE_PREFERENCES_STORAGE_KEY } from "../src/features/appearance/appearancePreferences";
import {
  useDesktopPreferences,
  type DesktopPreferencesController,
} from "../src/features/app-shell/useDesktopPreferences";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let latest: DesktopPreferencesController | null;

beforeEach(() => {
  latest = null;
  window.localStorage.clear();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  window.localStorage.clear();
});

describe("desktop surface theme preferences", () => {
  it("persists one coordinated theme pack and synchronizes storage changes", () => {
    act(() => root.render(<Harness />));

    act(() => latest?.setThemePack("com.example.forest"));
    expect(readStored()).toMatchObject({
      version: 5,
      pack: "com.example.forest",
    });

    const remote: SurfaceThemePreferences = {
      version: 5,
      pack: "com.example.graphite",
    };
    act(() => window.dispatchEvent(new StorageEvent("storage", {
      key: SURFACE_THEME_PREFERENCES_STORAGE_KEY,
      newValue: JSON.stringify(remote),
    })));

    expect(latest?.surfaceThemePreferences).toEqual(remote);
  });

  it("retires previously selected Light and Dark palette presets", () => {
    window.localStorage.setItem(APPEARANCE_PREFERENCES_STORAGE_KEY, JSON.stringify({
      schemaVersion: 2,
      activeStyle: "default",
      shared: {
        themeMode: "system",
        lightThemePreset: "warm",
        darkThemePreset: "graphite",
      },
    }));

    act(() => root.render(<Harness />));

    expect(latest?.lightThemePreset).toBe("neutral");
    expect(latest?.darkThemePreset).toBe("default");
    const storedAppearance = JSON.parse(
      window.localStorage.getItem(APPEARANCE_PREFERENCES_STORAGE_KEY) ?? "null",
    );
    expect(storedAppearance.shared.lightThemePreset).toBe("neutral");
    expect(storedAppearance.shared.darkThemePreset).toBe("default");
  });
});

function Harness() {
  latest = useDesktopPreferences();
  return null;
}

function readStored(): SurfaceThemePreferences {
  return JSON.parse(window.localStorage.getItem(SURFACE_THEME_PREFERENCES_STORAGE_KEY) ?? "null");
}
