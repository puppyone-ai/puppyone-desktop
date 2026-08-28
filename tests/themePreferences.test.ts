import { describe, expect, it } from "vitest";
import {
  DEFAULT_SURFACE_THEME_PREFERENCES,
  parseSurfaceThemePreferences,
  resolveSurfaceThemeSelection,
  selectThemePack,
  serializeSurfaceThemePreferences,
  updateSurfaceThemeOverride,
} from "../src/features/themes/themePreferences";
import type { ThemeCatalogSnapshot, ThemeDefinition } from "../src/features/themes/themeTypes";

describe("surface theme preferences", () => {
  it("round-trips a theme pack with independent advanced overrides", () => {
    const preferences = {
      version: 2 as const,
      pack: "com.example.forest",
      overrides: {
        application: null,
        markdown: "local.css.newsprint",
        csv: null,
      },
    };

    expect(parseSurfaceThemePreferences(serializeSurfaceThemePreferences(preferences)))
      .toEqual(preferences);
  });

  it("migrates a shared version 1 selection into one theme pack", () => {
    expect(parseSurfaceThemePreferences(JSON.stringify({
      version: 1,
      application: "com.example.forest",
      markdown: "com.example.forest",
      csv: "com.example.forest",
    }))).toEqual({
      version: 2,
      pack: "com.example.forest",
      overrides: { application: null, markdown: null, csv: null },
    });
  });

  it("migrates mixed version 1 selections into Default plus advanced overrides", () => {
    expect(parseSurfaceThemePreferences(JSON.stringify({
      version: 1,
      application: "default",
      markdown: "local.css.newsprint",
      csv: "builtin.csv.spreadsheet",
    }))).toEqual({
      version: 2,
      pack: "default",
      overrides: {
        application: null,
        markdown: "local.css.newsprint",
        csv: "builtin.csv.spreadsheet",
      },
    });
  });

  it.each([null, "", "{", "[]", '{"version":3}', '{"version":2}'])
    ("falls back for missing or malformed value %s", (value) => {
      expect(parseSurfaceThemePreferences(value)).toEqual(DEFAULT_SURFACE_THEME_PREFERENCES);
    });

  it("updates the pack and nullable per-surface overrides without losing other intent", () => {
    const packed = selectThemePack(DEFAULT_SURFACE_THEME_PREFERENCES, "com.example.forest");
    const overridden = updateSurfaceThemeOverride(packed, "markdown", "local.css.newsprint");
    const reset = updateSurfaceThemeOverride(overridden, "markdown", null);

    expect(packed.pack).toBe("com.example.forest");
    expect(overridden.overrides).toEqual({
      application: null,
      markdown: "local.css.newsprint",
      csv: null,
    });
    expect(reset.overrides.markdown).toBeNull();
  });

  it("resolves pack targets, advanced overrides, missing targets, and mode compatibility", () => {
    const snapshot = catalog([
      theme("default", ["application", "markdown", "csv"], ["light", "dark"]),
      theme("com.example.forest", ["application", "markdown"], ["light", "dark"]),
      theme("com.example.paper", ["markdown"], ["light"]),
      theme("com.example.table", ["csv"], ["light", "dark"]),
    ]);
    const preferences = {
      version: 2 as const,
      pack: "com.example.forest",
      overrides: {
        application: null,
        markdown: "com.example.paper",
        csv: "com.example.table",
      },
    };

    expect(resolveSurfaceThemeSelection(preferences, snapshot, "light")).toEqual({
      application: "com.example.forest",
      markdown: "com.example.paper",
      csv: "com.example.table",
    });
    expect(resolveSurfaceThemeSelection(preferences, snapshot, "dark")).toEqual({
      application: "com.example.forest",
      markdown: "com.example.forest",
      csv: "com.example.table",
    });
  });

  it("falls back to Default when the selected pack or override is unavailable", () => {
    const snapshot = catalog([
      theme("default", ["application", "markdown", "csv"], ["light", "dark"]),
    ]);

    expect(resolveSurfaceThemeSelection({
      version: 2,
      pack: "com.example.missing",
      overrides: {
        application: null,
        markdown: "com.example.also-missing",
        csv: null,
      },
    }, snapshot, "dark")).toEqual({
      application: "default",
      markdown: "default",
      csv: "default",
    });
  });
});

function catalog(themes: readonly ThemeDefinition[]): ThemeCatalogSnapshot {
  return { themes, diagnostics: [] };
}

function theme(
  id: string,
  targets: ThemeDefinition["targets"],
  modes: ThemeDefinition["modes"],
): ThemeDefinition {
  return {
    id,
    name: id,
    version: "1.0.0",
    modes,
    targets,
    source: "builtin",
    compiledCss: {},
  };
}
