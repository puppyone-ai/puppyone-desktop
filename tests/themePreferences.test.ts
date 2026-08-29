import { describe, expect, it } from "vitest";
import {
  CUSTOM_CSS_THEME_ID,
  DEFAULT_SURFACE_THEME_PREFERENCES,
  parseSurfaceThemePreferences,
  resolveSurfaceThemeSelection,
  selectThemePack,
  serializeSurfaceThemePreferences,
  updateCustomCssEnabled,
} from "../src/features/themes/themePreferences";
import { getThemePacks } from "../src/features/themes/builtinSurfaceThemes";
import type { ThemeCatalogSnapshot, ThemeDefinition } from "../src/features/themes/themeTypes";

describe("surface theme preferences", () => {
  it("round-trips one coordinated theme pack with independent Custom CSS enablement", () => {
    const preferences = {
      version: 4 as const,
      pack: "com.example.forest",
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
      version: 4,
      pack: "com.example.forest",
      customCss: { application: false, markdown: false, csv: false },
    });
  });

  it("migrates mixed version 1 selections to Default without retaining surface overrides", () => {
    expect(parseSurfaceThemePreferences(JSON.stringify({
      version: 1,
      application: "default",
      markdown: "local.css.newsprint",
      csv: "builtin.csv.spreadsheet",
    }))).toEqual({
      version: 4,
      pack: "default",
      customCss: { application: false, markdown: false, csv: false },
    });
  });

  it("migrates version 3 by discarding packaged surface overrides", () => {
    expect(parseSurfaceThemePreferences(JSON.stringify({
      version: 3,
      pack: "com.example.forest",
      overrides: {
        application: "com.example.shell",
        markdown: "com.example.paper",
        csv: null,
      },
      customCss: { application: false, markdown: true, csv: false },
    }))).toEqual({
      version: 4,
      pack: "com.example.forest",
      customCss: { application: false, markdown: true, csv: false },
    });
  });

  it.each([null, "", "{", "[]", '{"version":5}', '{"version":4}', '{"version":3}'])
    ("falls back for missing or malformed value %s", (value) => {
      expect(parseSurfaceThemePreferences(value)).toEqual(DEFAULT_SURFACE_THEME_PREFERENCES);
    });

  it("updates the pack without losing Custom CSS intent", () => {
    const packed = selectThemePack(DEFAULT_SURFACE_THEME_PREFERENCES, "com.example.forest");

    expect(packed.pack).toBe("com.example.forest");
    expect(packed.customCss).toEqual(DEFAULT_SURFACE_THEME_PREFERENCES.customCss);
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
      version: 4,
      pack: "com.example.forest",
      customCss: { application: false, markdown: true, csv: false },
    });
  });

  it("enables and disables Custom CSS independently from theme selection", () => {
    const selected = selectThemePack(DEFAULT_SURFACE_THEME_PREFERENCES, "com.example.forest");
    const enabled = updateCustomCssEnabled(selected, "markdown", true);

    expect(enabled.pack).toBe("com.example.forest");
    expect(enabled.customCss.markdown).toBe(true);
    expect(updateCustomCssEnabled(enabled, "markdown", false).customCss.markdown).toBe(false);
  });

  it("applies a newly selected theme pack to every surface", () => {
    const preferences = {
      version: 4 as const,
      pack: "default",
      customCss: { application: false, markdown: false, csv: false },
    };

    const selected = selectThemePack(preferences, "com.example.forest");

    expect(selected).toEqual({
      version: 4,
      pack: "com.example.forest",
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

  it("falls back atomically when a pack is incomplete for the active mode", () => {
    const snapshot = catalog([
      theme("default", ["application", "markdown", "csv"], ["light", "dark"]),
      theme("com.example.forest", ["application", "markdown"], ["light", "dark"]),
      theme("com.example.paper", ["markdown"], ["light"]),
      theme("com.example.table", ["csv"], ["light", "dark"]),
    ]);
    const preferences = {
      version: 4 as const,
      pack: "com.example.forest",
      customCss: { application: false, markdown: false, csv: false },
    };

    expect(resolveSurfaceThemeSelection(preferences, snapshot, "light")).toEqual({
      application: "default",
      markdown: "default",
      csv: "default",
    });
    expect(resolveSurfaceThemeSelection(preferences, snapshot, "dark")).toEqual({
      application: "default",
      markdown: "default",
      csv: "default",
    });
  });

  it("falls back to Default when the selected pack is unavailable", () => {
    const snapshot = catalog([
      theme("default", ["application", "markdown", "csv"], ["light", "dark"]),
    ]);

    expect(resolveSurfaceThemeSelection({
      version: 4,
      pack: "com.example.missing",
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
