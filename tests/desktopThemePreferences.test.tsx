// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SURFACE_THEME_PREFERENCES_STORAGE_KEY,
  type SurfaceThemePreferences,
} from "../src/features/themes/themePreferences";
import {
  useDesktopPreferences,
  type DesktopPreferencesController,
} from "../src/features/app-shell/useDesktopPreferences";

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
  it("persists independent selections and synchronizes storage changes", () => {
    act(() => root.render(<Harness />));

    act(() => latest?.setSurfaceTheme("markdown", "local.css.newsprint"));
    expect(readStored()).toMatchObject({
      application: "default",
      markdown: "local.css.newsprint",
      csv: "default",
    });

    const remote: SurfaceThemePreferences = {
      version: 1,
      application: "com.example.graphite",
      markdown: "builtin.markdown.focus",
      csv: "builtin.csv.ledger",
    };
    act(() => window.dispatchEvent(new StorageEvent("storage", {
      key: SURFACE_THEME_PREFERENCES_STORAGE_KEY,
      newValue: JSON.stringify(remote),
    })));

    expect(latest?.surfaceThemePreferences).toEqual(remote);
  });
});

function Harness() {
  latest = useDesktopPreferences();
  return null;
}

function readStored(): SurfaceThemePreferences {
  return JSON.parse(window.localStorage.getItem(SURFACE_THEME_PREFERENCES_STORAGE_KEY) ?? "null");
}
