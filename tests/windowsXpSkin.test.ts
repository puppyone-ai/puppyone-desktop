import vm from "node:vm";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_INTERFACE_STYLE,
  INTERFACE_STYLES,
  getInterfaceStyleDefinition,
  getInterfaceStyleFirstPaint,
  getInterfaceStyleThemeModes,
  parseInterfaceStyle,
  resolveActiveThemeMode,
  supportsThemePreset,
} from "../src/features/appearance/interfaceStyles";

describe("Interface style registry", () => {
  it("owns every style id and safely parses persisted values", () => {
    expect(DEFAULT_INTERFACE_STYLE).toBe("default");
    expect(new Set(INTERFACE_STYLES.map((style) => style.id)).size).toBe(INTERFACE_STYLES.length);
    for (const style of INTERFACE_STYLES) expect(parseInterfaceStyle(style.id)).toBe(style.id);
    expect(parseInterfaceStyle("windows-7")).toBe(DEFAULT_INTERFACE_STYLE);
    expect(parseInterfaceStyle(null)).toBe(DEFAULT_INTERFACE_STYLE);
  });

  it("derives color controls and active modes from palette capabilities", () => {
    expect(getInterfaceStyleThemeModes("default")).toEqual(["system", "light", "dark"]);
    expect(supportsThemePreset("default", "light")).toBe(true);
    expect(supportsThemePreset("default", "dark")).toBe(true);
    expect(resolveActiveThemeMode("default", "system")).toBe("system");
    expect(resolveActiveThemeMode("default", "dark")).toBe("dark");

    for (const style of INTERFACE_STYLES.filter(({ palette }) => palette.kind === "fixed")) {
      expect(getInterfaceStyleThemeModes(style.id)).toEqual([]);
      expect(supportsThemePreset(style.id, "light")).toBe(false);
      expect(supportsThemePreset(style.id, "dark")).toBe(false);
      expect(resolveActiveThemeMode(style.id, "system")).toBe(style.palette.mode);
      expect(resolveActiveThemeMode(style.id, "dark")).toBe(style.palette.mode);
    }
  });

  it("uses the same generated manifest for first paint and the React runtime", () => {
    const bootstrap = source("public/interface-style-bootstrap.js");
    const initialTheme = source("public/initial-theme.js");
    const index = source("index.html");
    const bootstrapIndex = index.indexOf('/interface-style-bootstrap.js');
    const resolverIndex = index.indexOf('/initial-theme.js');

    expect(bootstrapIndex).toBeGreaterThan(0);
    expect(resolverIndex).toBeGreaterThan(bootstrapIndex);
    expect(initialTheme).not.toContain('"windows-xp"');
    expect(initialTheme).not.toContain('"macos-tiger"');

    for (const style of INTERFACE_STYLES) {
      const requestedMode = "dark";
      const activeMode = resolveActiveThemeMode(style.id, requestedMode);
      const resolvedTheme = activeMode === "system" ? "dark" : activeMode;
      const expectedPaint = getInterfaceStyleFirstPaint(style.id, resolvedTheme);
      const result = runFirstPaint({
        bootstrap,
        initialTheme,
        interfaceStyle: style.id,
        themeMode: requestedMode,
        systemDark: true,
      });

      expect(result.dataset.interfaceStyle).toBe(style.id);
      expect(result.dataset.initialTheme).toBe(resolvedTheme);
      expect(result.properties["--initial-shell-background"]).toBe(expectedPaint.background);
      expect(result.properties["--initial-shell-color-scheme"]).toBe(expectedPaint.colorScheme);
    }
  });

  it("generates deterministic skin imports and enforces one shared component contract", () => {
    const appEntry = source("src/styles.css").trim();
    const skinEntry = source("src/styles/interface-styles.generated.css").trim();
    const contract = source("src/styles/interface-skin-contract.css");

    expect(appEntry.endsWith('@import "./styles/interface-styles.generated.css";')).toBe(true);
    expect(skinEntry).toContain('@import "./interface-skin-contract.css";');
    expect(contract).toContain(':root[data-interface-style]:not([data-interface-style="default"])');
    for (const selector of [
      ".desktop-titlebar",
      ".desktop-explorer-toolbar",
      ".desktop-menu-surface",
      ".desktop-dialog-footer",
      ".desktop-settings-switch",
      "::-webkit-scrollbar",
    ]) {
      expect(contract, selector).toContain(selector);
    }

    for (const style of INTERFACE_STYLES) {
      if (style.stylesheet === null) continue;
      expect(skinEntry).toContain(`@import "./${style.stylesheet}";`);
      const skin = source(`src/styles/${style.stylesheet}`);
      expect(skin).toContain(`:root[data-interface-style="${style.id}"]`);
      expect(skin).toContain("--interface-titlebar-control-border:");
      expect(skin).toContain("--interface-settings-list-background:");
    }
  });

  it("retains the historically specific XP and Tiger treatments", () => {
    const xp = source("src/styles/windows-xp.css");
    const tiger = source("src/styles/macos-tiger.css");
    expect(xp).toContain("--xp-titlebar-start:");
    expect(xp).toContain("--xp-button-hover-start:");
    expect(tiger).toContain("--tiger-brushed-metal:");
    expect(tiger).toContain("--tiger-pinstripe:");
    expect(tiger).toContain("--tiger-aqua:");
  });

  it("has a translated label for every registered style", () => {
    const localeManifest = JSON.parse(source("locales/manifest.json")) as {
      locales: Array<{ locale: string }>;
    };

    for (const { locale } of localeManifest.locales) {
      const catalog = JSON.parse(source(`locales/renderer/${locale}/settings.json`)) as Record<string, string>;
      for (const style of INTERFACE_STYLES) {
        const catalogKey = style.labelKey.replace(/^settings\./, "");
        expect(catalog[catalogKey], `${locale}: ${style.labelKey}`).toBeTruthy();
      }
      expect(catalog["appearance.theme.title"], locale).not.toBe(catalog["appearance.interfaceStyle.title"]);
    }
  });

  it("keeps every registry lookup total", () => {
    for (const style of INTERFACE_STYLES) {
      expect(getInterfaceStyleDefinition(style.id).id).toBe(style.id);
      const resolved = resolveActiveThemeMode(style.id, "system");
      const theme = resolved === "system" ? "light" : resolved;
      expect(getInterfaceStyleFirstPaint(style.id, theme).background).toMatch(/^#/);
    }
  });
});

function runFirstPaint({
  bootstrap,
  initialTheme,
  interfaceStyle,
  themeMode,
  systemDark,
}: {
  bootstrap: string;
  initialTheme: string;
  interfaceStyle: string;
  themeMode: string;
  systemDark: boolean;
}) {
  const dataset: Record<string, string> = {};
  const properties: Record<string, string> = {};
  const values = new Map([
    ["puppyone.desktop.interfaceStyle", interfaceStyle],
    ["puppyone.desktop.theme", themeMode],
  ]);
  const context = {
    window: {
      localStorage: { getItem: (key: string) => values.get(key) ?? null },
      matchMedia: () => ({ matches: systemDark }),
    },
    document: {
      documentElement: {
        dataset,
        style: { setProperty: (name: string, value: string) => { properties[name] = value; } },
      },
    },
  };
  vm.runInNewContext(bootstrap, context);
  vm.runInNewContext(initialTheme, context);
  return { dataset, properties };
}

function source(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}
