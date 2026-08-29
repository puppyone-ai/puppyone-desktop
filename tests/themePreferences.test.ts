import { describe, expect, it } from "vitest";
import {
  CUSTOM_CSS_THEME_ID,
  DEFAULT_SURFACE_THEME_PREFERENCES,
  parseSurfaceThemePreferences,
  resolveSurfaceThemeSelection,
  selectThemePack,
  serializeSurfaceThemePreferences,
  updateCustomCssEnabled,
  updateSurfaceThemeOverride,
} from "../src/features/themes/themePreferences";
import { getThemePacks, getThemesForTarget } from "../src/features/themes/builtinSurfaceThemes";
import type { ThemeCatalogSnapshot, ThemeDefinition } from "../src/features/themes/themeTypes";

describe("surface theme preferences", () => {
  it("round-trips a theme pack with independent advanced overrides", () => {
    const preferences = {
      version: 3 as const,
      pack: "com.example.forest",
      overrides: {
        application: null,
        markdown: "local.css.newsprint",
        csv: null,
      },
      customCss: { application: false, markdown: true, csv: false },
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
      version: 3,
      pack: "com.example.forest",
      overrides: { application: null, markdown: null, csv: null },
      customCss: { application: false, markdown: false, csv: false },
    });
  });

  it("migrates mixed version 1 selections into Default plus advanced overrides", () => {
    expect(parseSurfaceThemePreferences(JSON.stringify({
      version: 1,
      application: "default",
      markdown: "local.css.newsprint",
      csv: "builtin.csv.spreadsheet",
    }))).toEqual({
      version: 3,
      pack: "default",
      overrides: {
        application: null,
        markdown: "local.css.newsprint",
        csv: "builtin.csv.spreadsheet",
      },
      customCss: { application: false, markdown: false, csv: false },
    });
  });

  it.each([null, "", "{", "[]", '{"version":4}', '{"version":3}'])
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

  it("migrates a version 2 Custom CSS override into an enabled overlay on the pack", () => {
    expect(parseSurfaceThemePreferences(JSON.stringify({
      version: 2,
      pack: "com.example.forest",
      overrides: {
        application: null,
        markdown: CUSTOM_CSS_THEME_ID,
        csv: "com.example.table",
      },
    }))).toEqual({
      version: 3,
      pack: "com.example.forest",
      overrides: {
        application: null,
        markdown: null,
        csv: "com.example.table",
      },
      customCss: { application: false, markdown: true, csv: false },
    });
  });

  it("enables and disables Custom CSS independently from theme selection", () => {
    const selected = updateSurfaceThemeOverride(
      selectThemePack(DEFAULT_SURFACE_THEME_PREFERENCES, "com.example.forest"),
      "markdown",
      "com.example.paper",
    );
    const enabled = updateCustomCssEnabled(selected, "markdown", true);

    expect(enabled.pack).toBe("com.example.forest");
    expect(enabled.overrides.markdown).toBe("com.example.paper");
    expect(enabled.customCss.markdown).toBe(true);
    expect(updateCustomCssEnabled(enabled, "markdown", false).customCss.markdown).toBe(false);
  });

  it("applies a newly selected theme pack to every surface by clearing advanced overrides", () => {
    const preferences = {
      version: 3 as const,
      pack: "default",
      overrides: {
        application: "default",
        markdown: "builtin.markdown.newsprint",
        csv: "builtin.csv.ledger",
      },
      customCss: { application: false, markdown: false, csv: false },
    };

    const selected = selectThemePack(preferences, "com.example.forest");

    expect(selected).toEqual({
      version: 3,
      pack: "com.example.forest",
      overrides: { application: null, markdown: null, csv: null },
      customCss: { application: false, markdown: false, csv: false },
    });
    expect(resolveSurfaceThemeSelection(selected, catalog([
      theme("default", ["application", "markdown", "csv"], ["light", "dark"]),
      theme("com.example.forest", ["application", "markdown", "csv"], ["light", "dark"]),
    ]), "light")).toEqual({
      application: "com.example.forest",
      markdown: "com.example.forest",
      csv: "com.example.forest",
    });
  });

  it("resolves pack targets, advanced overrides, missing targets, and mode compatibility", () => {
    const snapshot = catalog([
      theme("default", ["application", "markdown", "csv"], ["light", "dark"]),
      theme("com.example.forest", ["application", "markdown"], ["light", "dark"]),
      theme("com.example.paper", ["markdown"], ["light"]),
      theme("com.example.table", ["csv"], ["light", "dark"]),
    ]);
    const preferences = {
      version: 3 as const,
      pack: "com.example.forest",
      overrides: {
        application: null,
        markdown: "com.example.paper",
        csv: "com.example.table",
      },
      customCss: { application: false, markdown: false, csv: false },
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
      version: 3,
      pack: "com.example.missing",
      overrides: {
        application: null,
        markdown: "com.example.also-missing",
        csv: null,
      },
      customCss: { application: false, markdown: false, csv: false },
    }, snapshot, "dark")).toEqual({
      application: "default",
      markdown: "default",
      csv: "default",
    });
  });

  it("keeps managed Custom CSS and incomplete packages out of the primary pack list", () => {
    const snapshot = catalog([
      theme("default", ["application", "markdown", "csv"], ["light", "dark"]),
      theme("com.example.complete", ["application", "markdown", "csv"], ["light", "dark"]),
      theme("com.example.partial", ["markdown", "csv"], ["light", "dark"]),
      theme(CUSTOM_CSS_THEME_ID, ["application", "markdown", "csv"], ["light", "dark"]),
    ]);

    expect(getThemePacks(snapshot).map((item) => item.id)).toEqual([
      "default",
      "com.example.complete",
    ]);
    expect(getThemesForTarget(snapshot, "markdown").map((item) => item.id)).not.toContain(
      CUSTOM_CSS_THEME_ID,
    );
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
