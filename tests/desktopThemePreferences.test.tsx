// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  APPEARANCE_PREFERENCES_STORAGE_KEY,
  type AppearancePreferencesV4,
} from "../src/features/appearance/appearancePreferences";
import { LEGACY_SURFACE_THEME_PREFERENCES_STORAGE_KEY } from "../src/features/themes/subThemePreferences";
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

describe("desktop appearance preferences", () => {
  it("persists one canonical V4 document and remembers Sub Themes independently by mode and Root Theme", () => {
    act(() => root.render(<Harness />));

    act(() => {
      latest?.setSubThemeId("default.github");
      latest?.setThemeMode("dark");
    });
    expect(readStored().byRootTheme.default).toEqual({
      requestedColorMode: "dark",
      requestedSubThemeIds: {
        light: "default.github",
        dark: "default.neutral",
      },
    });
    expect(latest?.requestedSubThemeId).toBe("default.neutral");

    act(() => latest?.setSubThemeId("default.newspaper"));
    expect(readStored().byRootTheme.default.requestedSubThemeIds).toEqual({
      light: "default.github",
      dark: "default.newspaper",
    });

    act(() => latest?.setInterfaceStyle("windows-xp"));
    expect(latest?.requestedSubThemeId).toBe("windows-xp.luna-blue");
    expect(latest?.themeMode).toBe("light");

    act(() => latest?.setInterfaceStyle("default"));
    expect(latest?.requestedSubThemeId).toBe("default.newspaper");
    expect(latest?.themeMode).toBe("dark");
    act(() => latest?.setThemeMode("light"));
    expect(latest?.requestedSubThemeId).toBe("default.github");
    expect(readStored().schemaVersion).toBe(4);
    expect(window.localStorage.getItem(LEGACY_SURFACE_THEME_PREFERENCES_STORAGE_KEY)).toBeNull();
  });

  it("synchronizes the canonical appearance document across windows", () => {
    act(() => root.render(<Harness />));
    const remote: AppearancePreferencesV4 = {
      ...readStored(),
      activeRootThemeId: "windows-xp",
      byRootTheme: {
        ...readStored().byRootTheme,
        "windows-xp": {
          requestedColorMode: "light",
          requestedSubThemeIds: {
            light: "windows-xp.luna-blue",
            dark: "windows-xp.luna-blue",
          },
        },
      },
    };

    act(() => window.dispatchEvent(new StorageEvent("storage", {
      key: APPEARANCE_PREFERENCES_STORAGE_KEY,
      newValue: JSON.stringify(remote),
    })));

    expect(latest?.interfaceStyle).toBe("windows-xp");
    expect(latest?.requestedSubThemeId).toBe("windows-xp.luna-blue");
    expect(latest?.themeMode).toBe("light");
  });

  it("migrates the retired coordinated Theme Pack into the active root", () => {
    window.localStorage.setItem(LEGACY_SURFACE_THEME_PREFERENCES_STORAGE_KEY, JSON.stringify({
      version: 5,
      pack: "builtin.pack.newspaper",
    }));

    act(() => root.render(<Harness />));

    expect(latest?.requestedSubThemeId).toBe("default.newspaper");
    expect(readStored().byRootTheme.default.requestedSubThemeIds).toEqual({
      light: "default.newspaper",
      dark: "default.newspaper",
    });
  });
});

function Harness() {
  latest = useDesktopPreferences();
  return null;
}

function readStored(): AppearancePreferencesV4 {
  return JSON.parse(
    window.localStorage.getItem(APPEARANCE_PREFERENCES_STORAGE_KEY) ?? "null",
  );
}
