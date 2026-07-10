import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  TEXT_SIZE_PRESETS,
  parseDarkThemePreset,
  parseDiffMarkers,
  parseDockIcon,
  parseExternalAppsSettings,
  parseExperimentalSettings,
  parsePointerCursors,
  parseTextSize,
} from "../src/preferences";

describe("appearance preferences", () => {
  it("defines curated integer typography presets", () => {
    expect(TEXT_SIZE_PRESETS.map((preset) => ({
      value: preset.value,
      sidebar: preset.sizes.sidebar,
      content: preset.sizes.content,
      code: preset.sizes.code,
    }))).toEqual([
      { value: "small", sidebar: 12, content: 13, code: 12 },
      { value: "default", sidebar: 13, content: 14, code: 13 },
      { value: "large", sidebar: 14, content: 16, code: 15 },
    ]);

    for (const preset of TEXT_SIZE_PRESETS) {
      expect(Object.values(preset.sizes).every(Number.isInteger)).toBe(true);
    }
  });

  it("keeps the CSS typography token sets aligned with the preset contract", () => {
    const css = readFileSync(new URL("../src/styles/tokens.css", import.meta.url), "utf8");
    const blocks = {
      small: readCssBlock(css, ':where(.app-shell, .onboarding-shell, .desktop-overlay-root)[data-text-size="small"]'),
      default: readCssBlock(css, ":root"),
      large: readCssBlock(css, ':where(.app-shell, .onboarding-shell, .desktop-overlay-root)[data-text-size="large"]'),
    };
    const tokenNames = {
      micro: "--po-text-size-micro",
      caption: "--po-text-size-caption",
      meta: "--po-text-size-meta",
      sidebar: "--po-text-size-sidebar",
      body: "--po-text-size-body",
      bodyLarge: "--po-text-size-body-lg",
      content: "--po-text-size-content",
      code: "--po-code-font-size",
      title: "--po-text-size-title",
      pageTitle: "--po-text-size-page-title",
      display: "--po-text-size-display",
    } as const;

    for (const preset of TEXT_SIZE_PRESETS) {
      const block = blocks[preset.value];
      for (const [role, size] of Object.entries(preset.sizes)) {
        expect(block).toContain(`${tokenNames[role as keyof typeof tokenNames]}: ${size}px;`);
      }
    }
  });

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

function readCssBlock(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Missing CSS block for ${selector}`);
  const bodyStart = start + selector.length + 2;
  const end = css.indexOf("\n}", bodyStart);
  if (end < 0) throw new Error(`Unclosed CSS block for ${selector}`);
  return css.slice(bodyStart, end);
}

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

describe("experimental preferences", () => {
  it("keeps Agent Chat off unless the user explicitly opts in", () => {
    expect(parseExperimentalSettings(null).enableAgentChat).toBe(false);
    expect(parseExperimentalSettings("not-json").enableAgentChat).toBe(false);
    expect(parseExperimentalSettings(JSON.stringify({ enableAgentChat: true }))).toMatchObject({
      enableAgentChat: true,
      enableAssetLibraryHome: false,
      enablePuppyoneAppFiles: false,
      enablePuppyFlowFiles: false,
    });
    expect(parseExperimentalSettings(JSON.stringify({ enableAgentCompanion: true })).enableAgentChat).toBe(true);
  });

  it("keeps the Asset Library homepage off unless the user explicitly opts in", () => {
    expect(parseExperimentalSettings(null).enableAssetLibraryHome).toBe(false);
    expect(parseExperimentalSettings(JSON.stringify({ enableAssetLibraryHome: false })).enableAssetLibraryHome).toBe(false);
    expect(parseExperimentalSettings(JSON.stringify({ enableAssetLibraryHome: true })).enableAssetLibraryHome).toBe(true);
  });
});
