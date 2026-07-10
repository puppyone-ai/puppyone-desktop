import { describe, expect, it } from "vitest";

import {
  parseDarkThemePreset,
  parseDiffMarkers,
  parseDockIcon,
  parseExternalAppsSettings,
  parsePointerCursors,
  parseTextSize,
} from "../src/preferences";

describe("appearance preferences", () => {
  it("accepts only curated appearance values", () => {
    expect(parseTextSize("large")).toBe("large");
    expect(parseTextSize("17px")).toBe("default");
    expect(parseDarkThemePreset("warm")).toBe("warm");
    expect(parseDarkThemePreset("custom")).toBe("default");
    expect(parseDockIcon("matte")).toBe("matte");
    expect(parseDockIcon("/tmp/icon.png")).toBe("polished");
    expect(parseDiffMarkers("symbols")).toBe("symbols");
    expect(parseDiffMarkers("both")).toBe("color");
  });

  it("keeps pointer cursors off unless explicitly enabled", () => {
    expect(parsePointerCursors("true")).toBe(true);
    expect(parsePointerCursors("false")).toBe(false);
    expect(parsePointerCursors(null)).toBe(false);
  });
});

describe("external app preferences", () => {
  it("drops the legacy renderer-controlled executable confirmation preference", () => {
    const settings = parseExternalAppsSettings(JSON.stringify({
      openMode: "system",
      confirmExecutableFiles: false,
      overrides: [{
        extension: "PDF",
        appPath: " /Applications/Preview.app ",
      }],
    }));

    expect(settings).toEqual({
      openMode: "system",
      overrides: [{
        extension: "pdf",
        appPath: "/Applications/Preview.app",
      }],
    });
    expect(settings).not.toHaveProperty("confirmExecutableFiles");
  });
});
