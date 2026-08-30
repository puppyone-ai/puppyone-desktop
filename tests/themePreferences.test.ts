import { describe, expect, it } from "vitest";
import {
  DEFAULT_SURFACE_THEME_PREFERENCES,
  parseSurfaceThemePreferences,
  resolveSurfaceThemeSelection,
  selectThemePack,
  serializeSurfaceThemePreferences,
} from "../src/features/themes/themePreferences";
import { getThemePacks } from "../src/features/themes/builtinSurfaceThemes";
import type { ThemeCatalogSnapshot, ThemeDefinition } from "../src/features/themes/themeTypes";

describe("surface theme preferences", () => {
  it("round-trips one coordinated theme pack", () => {
    const preferences = {
      version: 5 as const,
      pack: "com.example.forest",
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
      version: 5,
      pack: "com.example.forest",
    });
  });

  it("migrates mixed version 1 selections to Default without retaining surface overrides", () => {
    expect(parseSurfaceThemePreferences(JSON.stringify({
      version: 1,
      application: "default",
      markdown: "local.css.newsprint",
      csv: "builtin.csv.spreadsheet",
    }))).toEqual({
      version: 5,
      pack: "default",
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
      version: 5,
      pack: "com.example.forest",
    });
  });

  it("migrates version 4 by dropping legacy Custom CSS enablement", () => {
    expect(parseSurfaceThemePreferences(JSON.stringify({
      version: 4,
      pack: "com.example.forest",
      customCss: { application: true, markdown: true, csv: true },
    }))).toEqual({
      version: 5,
      pack: "com.example.forest",
    });
  });

  it.each([null, "", "{", "[]", '{"version":6}', '{"version":5}', '{"version":4}', '{"version":3}'])
    ("falls back for missing or malformed value %s", (value) => {
      expect(parseSurfaceThemePreferences(value)).toEqual(DEFAULT_SURFACE_THEME_PREFERENCES);
    });

  it("updates the coordinated pack", () => {
    const packed = selectThemePack(DEFAULT_SURFACE_THEME_PREFERENCES, "com.example.forest");

    expect(packed.pack).toBe("com.example.forest");
    expect(packed).toEqual({ version: 5, pack: "com.example.forest" });
  });

  it("drops a legacy version 2 Custom CSS override while retaining the pack", () => {
    expect(parseSurfaceThemePreferences(JSON.stringify({
      version: 2,
      pack: "com.example.forest",
      overrides: {
        application: null,
        markdown: "local.puppyone.custom-css",
        csv: "com.example.table",
      },
    }))).toEqual({
      version: 5,
      pack: "com.example.forest",
    });
  });

  it("applies a newly selected theme pack to every surface", () => {
    const preferences = {
      version: 5 as const,
      pack: "default",
    };

    const selected = selectThemePack(preferences, "com.example.forest");

    expect(selected).toEqual({
      version: 5,
      pack: "com.example.forest",
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
      version: 5 as const,
      pack: "com.example.forest",
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
      version: 5,
      pack: "com.example.missing",
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
      theme("local.puppyone.custom-css", ["application", "markdown", "csv"], ["light", "dark"]),
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
