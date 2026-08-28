import { describe, expect, it } from "vitest";
import {
  DEFAULT_SURFACE_THEME_PREFERENCES,
  parseSurfaceThemePreferences,
  serializeSurfaceThemePreferences,
} from "../src/features/themes/themePreferences";

describe("surface theme preferences", () => {
  it("round-trips independent application, Markdown, and CSV theme IDs", () => {
    const preferences = {
      version: 1 as const,
      application: "com.example.graphite",
      markdown: "local.css.newsprint",
      csv: "builtin.csv.spreadsheet",
    };

    expect(parseSurfaceThemePreferences(serializeSurfaceThemePreferences(preferences)))
      .toEqual(preferences);
  });

  it.each([null, "", "{", "[]", '{"version":2}'])
    ("falls back for missing or malformed value %s", (value) => {
      expect(parseSurfaceThemePreferences(value)).toEqual(DEFAULT_SURFACE_THEME_PREFERENCES);
    });

  it("falls back per field while preserving syntactically valid unavailable IDs", () => {
    expect(parseSurfaceThemePreferences(JSON.stringify({
      version: 1,
      application: "default",
      markdown: "com.example.not-installed",
      csv: "../../unsafe",
    }))).toEqual({
      version: 1,
      application: "default",
      markdown: "com.example.not-installed",
      csv: "default",
    });
  });
});
