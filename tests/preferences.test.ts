import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  DEFAULT_EXPERIMENTAL_SETTINGS,
  TEXT_SIZE_PRESETS,
  getVisibleCreateNewItems,
  parseCreateNewMenuSettings,
  parseDarkThemePreset,
  parseDiffMarkers,
  parseDockIcon,
  parseExternalAppsSettings,
  parseExperimentalSettings,
  parseLoadingAnimationPreset,
  parsePointerCursors,
  parseSidebarNavigationVisibilitySettings,
  parseTerminalSessionLayout,
  parseTextSize,
} from "../src/preferences";

describe("create new menu preferences", () => {
  it("migrates the legacy default while preserving explicit order and visibility", () => {
    expect(parseCreateNewMenuSettings(null)).toEqual({
      version: 3,
      items: [
        { kind: "markdown", enabled: true },
        { kind: "contextMap", enabled: true },
        { kind: "csv", enabled: true },
        { kind: "html", enabled: true },
        { kind: "slides", enabled: true },
      ],
    });
    expect(parseCreateNewMenuSettings(JSON.stringify({
      items: [
        { kind: "json", enabled: false },
        { kind: "text", enabled: true },
      ],
    }))).toEqual({
      version: 3,
      items: [
        { kind: "json", enabled: false },
        { kind: "text", enabled: true },
      ],
    });
    expect(parseCreateNewMenuSettings(JSON.stringify({
      items: [
        { kind: "markdown", enabled: true },
        { kind: "csv", enabled: true },
      ],
    }))).toEqual({
      version: 3,
      items: [
        { kind: "markdown", enabled: true },
        { kind: "contextMap", enabled: true },
        { kind: "csv", enabled: true },
        { kind: "html", enabled: true },
        { kind: "slides", enabled: true },
      ],
    });
    expect(parseCreateNewMenuSettings(JSON.stringify({
      version: 2,
      items: [
        { kind: "markdown", enabled: true },
        { kind: "csv", enabled: true },
      ],
    }))).toEqual({
      version: 3,
      items: [
        { kind: "markdown", enabled: true },
        { kind: "contextMap", enabled: true },
        { kind: "csv", enabled: true },
        { kind: "html", enabled: true },
        { kind: "slides", enabled: true },
      ],
    });
    expect(parseCreateNewMenuSettings(JSON.stringify({
      version: 3,
      items: [
        { kind: "markdown", enabled: true },
        { kind: "csv", enabled: true },
      ],
    }))).toEqual({
      version: 3,
      items: [
        { kind: "markdown", enabled: true },
        { kind: "csv", enabled: true },
      ],
    });
  });

  it("deduplicates valid file types and recovers from malformed persisted values", () => {
    expect(parseCreateNewMenuSettings(JSON.stringify({
      items: [
        { kind: "json", enabled: true },
        { kind: "json", enabled: false },
        { kind: "not-a-file-type", enabled: true },
      ],
    }))).toEqual({
      version: 3,
      items: [{ kind: "json", enabled: true }],
    });
    expect(parseCreateNewMenuSettings(JSON.stringify({
      items: [{ kind: "not-a-file-type" }],
    }))).toEqual({
      version: 3,
      items: [
        { kind: "markdown", enabled: true },
        { kind: "contextMap", enabled: true },
        { kind: "csv", enabled: true },
        { kind: "html", enabled: true },
        { kind: "slides", enabled: true },
      ],
    });
    expect(parseCreateNewMenuSettings(JSON.stringify({ items: [] }))).toEqual({ version: 3, items: [] });
  });

  it("shows only enabled and currently available file types", () => {
    const settings = {
      version: 3,
      items: [
        { kind: "app", enabled: true },
        { kind: "json", enabled: false },
        { kind: "csv", enabled: true },
      ],
    } as const;
    expect(getVisibleCreateNewItems(settings, DEFAULT_EXPERIMENTAL_SETTINGS)).toEqual(["app", "csv"]);
  });
});

describe("appearance preferences", () => {
  it("defines curated integer typography presets", () => {
    expect(TEXT_SIZE_PRESETS.map((preset) => ({
      value: preset.value,
      sidebar: preset.sizes.sidebar,
      content: preset.sizes.content,
      code: preset.sizes.code,
      terminal: preset.sizes.terminal,
    }))).toEqual([
      { value: "small", sidebar: 12, content: 13, code: 12, terminal: 12 },
      { value: "default", sidebar: 13, content: 14, code: 13, terminal: 13 },
      { value: "large", sidebar: 14, content: 16, code: 15, terminal: 15 },
    ]);

    for (const preset of TEXT_SIZE_PRESETS) {
      expect(Object.values(preset.sizes).every(Number.isInteger)).toBe(true);
    }
  });

  it("keeps the CSS typography token sets aligned with the preset contract", () => {
    const css = readFileSync(
      new URL("../src/styles/typography/foundations.css", import.meta.url),
      "utf8",
    );
    const tokens = readFileSync(new URL("../src/styles/tokens.css", import.meta.url), "utf8");
    const blocks = {
      small: [
        readCssBlock(
          css,
          ':where(.app-shell, .onboarding-shell, .desktop-overlay-root)[data-interface-text-size="small"],\n:where(.app-shell, .onboarding-shell, .desktop-overlay-root)[data-text-size="small"]:not([data-interface-text-size])',
        ),
        readCssBlock(
          css,
          ':where(.app-shell, .onboarding-shell, .desktop-overlay-root)[data-content-text-size="small"],\n:where(.app-shell, .onboarding-shell, .desktop-overlay-root)[data-text-size="small"]:not([data-content-text-size])',
        ),
        readCssBlock(
          css,
          ':where(.app-shell, .onboarding-shell, .desktop-overlay-root)[data-terminal-text-size="small"],\n:where(.app-shell, .onboarding-shell, .desktop-overlay-root)[data-text-size="small"]:not([data-terminal-text-size])',
        ),
      ].join("\n"),
      default: readCssBlock(
        css,
        ":root,\n:where(.app-shell, .onboarding-shell, .desktop-overlay-root, .desktop-theme-preview-surface, .dark)",
      ),
      large: [
        readCssBlock(
          css,
          ':where(.app-shell, .onboarding-shell, .desktop-overlay-root)[data-interface-text-size="large"],\n:where(.app-shell, .onboarding-shell, .desktop-overlay-root)[data-text-size="large"]:not([data-interface-text-size])',
        ),
        readCssBlock(
          css,
          ':where(.app-shell, .onboarding-shell, .desktop-overlay-root)[data-content-text-size="large"],\n:where(.app-shell, .onboarding-shell, .desktop-overlay-root)[data-text-size="large"]:not([data-content-text-size])',
        ),
        readCssBlock(
          css,
          ':where(.app-shell, .onboarding-shell, .desktop-overlay-root)[data-terminal-text-size="large"],\n:where(.app-shell, .onboarding-shell, .desktop-overlay-root)[data-text-size="large"]:not([data-terminal-text-size])',
        ),
      ].join("\n"),
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
      terminal: "--po-terminal-font-size",
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

    expect(tokens).toMatch(
      /:root,\s*:where\(\.app-shell, \.onboarding-shell, \.desktop-overlay-root, \.desktop-theme-preview-surface, \.dark\)\s*\{[^}]*--desktop-sidebar-font-size:\s*var\(--po-text-size-sidebar\);[^}]*--desktop-sidebar-font-size-meta:\s*var\(--po-text-size-meta\);/s,
    );
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
    expect(parseLoadingAnimationPreset("ikun")).toBe("ikun");
    expect(parseLoadingAnimationPreset("ymca")).toBe("ymca");
    expect(parseLoadingAnimationPreset("siu")).toBe("siu");
    expect(parseLoadingAnimationPreset("sparkles")).toBe("ikun");
  });

  it("keeps pointer cursors off unless explicitly enabled", () => {
    expect(parsePointerCursors("true")).toBe(true);
    expect(parsePointerCursors("false")).toBe(false);
    expect(parsePointerCursors(null)).toBe(false);
  });

  it("keeps Terminal sessions in the visible tab bar by default and accepts the header menu layout", () => {
    expect(parseTerminalSessionLayout(null)).toBe("tabs");
    expect(parseTerminalSessionLayout("menu")).toBe("menu");
    expect(parseTerminalSessionLayout("tabs")).toBe("tabs");
    expect(parseTerminalSessionLayout("floating")).toBe("tabs");
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
      enableCloudWorkspace: false,
      enableEditorSaveStatus: false,
      enableMarkdownBlockDrag: false,
      enableMinimalMode: false,
      enablePuppyFlowFiles: false,
      enableViewerPlugins: false,
    });
    expect(parseExperimentalSettings(JSON.stringify({ enableAgentCompanion: true })).enableAgentChat).toBe(true);
  });

  it("keeps PuppyOne Cloud off unless the user explicitly opts in", () => {
    expect(parseExperimentalSettings(null).enableCloudWorkspace).toBe(false);
    expect(parseExperimentalSettings("not-json").enableCloudWorkspace).toBe(false);
    expect(parseExperimentalSettings(JSON.stringify({ enableCloudWorkspace: false })).enableCloudWorkspace).toBe(false);
    expect(parseExperimentalSettings(JSON.stringify({ enableCloudWorkspace: true })).enableCloudWorkspace).toBe(true);
  });

  it("keeps the editor save status hidden unless the user explicitly opts in", () => {
    expect(parseExperimentalSettings(null).enableEditorSaveStatus).toBe(false);
    expect(parseExperimentalSettings("not-json").enableEditorSaveStatus).toBe(false);
    expect(parseExperimentalSettings(JSON.stringify({ enableEditorSaveStatus: false })).enableEditorSaveStatus).toBe(false);
    expect(parseExperimentalSettings(JSON.stringify({ enableEditorSaveStatus: true })).enableEditorSaveStatus).toBe(true);
  });

  it("keeps Context Maps experimental and migrates the former relationship flag", () => {
    expect(parseExperimentalSettings(null).enableContextMaps).toBe(false);
    expect(parseExperimentalSettings(JSON.stringify({ enableContextMaps: true })).enableContextMaps)
      .toBe(true);
    expect(parseExperimentalSettings(JSON.stringify({ enableFolderRelationships: true })).enableContextMaps)
      .toBe(true);
  });

  it("keeps Minimal Mode off unless the user explicitly opts in", () => {
    expect(parseExperimentalSettings(null).enableMinimalMode).toBe(false);
    expect(parseExperimentalSettings("not-json").enableMinimalMode).toBe(false);
    expect(parseExperimentalSettings(JSON.stringify({ enableMinimalMode: false })).enableMinimalMode).toBe(false);
    expect(parseExperimentalSettings(JSON.stringify({ enableMinimalMode: true })).enableMinimalMode).toBe(true);
  });

  it("keeps Markdown block drag handles off unless the user explicitly opts in", () => {
    expect(parseExperimentalSettings(null).enableMarkdownBlockDrag).toBe(false);
    expect(parseExperimentalSettings("not-json").enableMarkdownBlockDrag).toBe(false);
    expect(parseExperimentalSettings(JSON.stringify({ enableMarkdownBlockDrag: false })).enableMarkdownBlockDrag).toBe(false);
    expect(parseExperimentalSettings(JSON.stringify({ enableMarkdownBlockDrag: true })).enableMarkdownBlockDrag).toBe(true);
  });

  it("keeps the Asset Library homepage off unless the user explicitly opts in", () => {
    expect(parseExperimentalSettings(null).enableAssetLibraryHome).toBe(false);
    expect(parseExperimentalSettings(JSON.stringify({ enableAssetLibraryHome: false })).enableAssetLibraryHome).toBe(false);
    expect(parseExperimentalSettings(JSON.stringify({ enableAssetLibraryHome: true })).enableAssetLibraryHome).toBe(true);
  });

  it("keeps Viewer Plugins off unless the user explicitly opts in", () => {
    expect(parseExperimentalSettings(null).enableViewerPlugins).toBe(false);
    expect(parseExperimentalSettings(JSON.stringify({ enableViewerPlugins: false })).enableViewerPlugins).toBe(false);
    expect(parseExperimentalSettings(JSON.stringify({ enableViewerPlugins: true })).enableViewerPlugins).toBe(true);
  });

  it("ignores the retired built-in Office editing experiment", () => {
    expect(parseExperimentalSettings(JSON.stringify({ enableOfficeEditing: true })))
      .not.toHaveProperty("enableOfficeEditing");
  });
});

describe("sidebar navigation visibility preferences", () => {
  it("shows optional shortcuts by default and preserves an explicit hidden choice", () => {
    expect(parseSidebarNavigationVisibilitySettings(null).enabled.plugins).toBe(true);
    expect(parseSidebarNavigationVisibilitySettings("not-json").enabled.plugins).toBe(true);
    expect(parseSidebarNavigationVisibilitySettings(JSON.stringify({
      enabled: { plugins: false },
    })).enabled.plugins).toBe(false);
  });
});
