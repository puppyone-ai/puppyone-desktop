import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parseInterfaceStyle, resolveActiveThemeMode } from "../src/preferences";

describe("Fixed-palette interface skins", () => {
  it("accepts only the curated interface style", () => {
    expect(parseInterfaceStyle("windows-xp")).toBe("windows-xp");
    expect(parseInterfaceStyle("macos-tiger")).toBe("macos-tiger");
    expect(parseInterfaceStyle("default")).toBe("default");
    expect(parseInterfaceStyle("windows-7")).toBe("default");
    expect(parseInterfaceStyle(null)).toBe("default");
  });

  it("keeps Default color preferences separate from fixed-palette skins", () => {
    expect(resolveActiveThemeMode("default", "system")).toBe("system");
    expect(resolveActiveThemeMode("default", "dark")).toBe("dark");
    expect(resolveActiveThemeMode("windows-xp", "system")).toBe("light");
    expect(resolveActiveThemeMode("windows-xp", "dark")).toBe("light");
    expect(resolveActiveThemeMode("macos-tiger", "system")).toBe("light");
    expect(resolveActiveThemeMode("macos-tiger", "dark")).toBe("light");
  });

  it("persists the style and exposes it at both first paint and the app shell", () => {
    const preferences = source("src/preferences.ts");
    const controller = source("src/features/app-shell/useDesktopPreferences.ts");
    const app = source("src/App.tsx");
    const firstPaint = source("public/initial-theme.js");

    expect(preferences).toContain('INTERFACE_STYLE_STORAGE_KEY = "puppyone.desktop.interfaceStyle"');
    expect(controller).toContain("document.documentElement.dataset.interfaceStyle = interfaceStyle");
    expect(app).toContain("data-interface-style={interfaceStyle}");
    expect(firstPaint).toContain('window.localStorage.getItem("puppyone.desktop.interfaceStyle")');
    expect(firstPaint).toContain('storedInterfaceStyle === "windows-xp"');
    expect(firstPaint).toContain('storedInterfaceStyle === "macos-tiger"');
    expect(firstPaint).toContain('interfaceStyle === "default" && dark');
  });

  it("offers Default and both fixed skins as Appearance theme choices without changing the shell composition", () => {
    const settings = source("src/features/settings/SettingsView.tsx");
    const interfaceStyleSetting = source("src/features/settings/main/InterfaceStyleSetting.tsx");
    const shell = source("src/components/DesktopCloudShell.tsx");

    expect(settings).toContain("<InterfaceStyleSetting");
    expect(interfaceStyleSetting).toContain('onClick={() => onChange("default")}');
    expect(interfaceStyleSetting).toContain('onClick={() => onChange("windows-xp")}');
    expect(interfaceStyleSetting).toContain('aria-pressed={value === "windows-xp"}');
    expect(interfaceStyleSetting).toContain('onClick={() => onChange("macos-tiger")}');
    expect(interfaceStyleSetting).toContain('aria-pressed={value === "macos-tiger"}');
    expect(interfaceStyleSetting).not.toContain('type="checkbox"');
    expect(settings).toContain('interfaceStyle === "default"');
    expect(shell).not.toContain("windows-xp");
    expect(shell).not.toContain("macos-tiger");
  });

  it("loads a fixed-palette skin layer with chrome, control, menu, and dialog treatments", () => {
    const entry = source("src/styles.css").trim();
    const skin = source("src/styles/windows-xp.css");

    expect(entry).toContain('@import "./styles/windows-xp.css";');
    expect(skin).toContain(':root[data-interface-style="windows-xp"]');
    expect(skin).not.toContain(":not(.dark)");
    expect(skin).not.toContain(".desktop-theme-preview-surface).dark");
    for (const selector of [
      ".desktop-titlebar",
      ".desktop-explorer-toolbar",
      ".tree-row.selected",
      ".desktop-menu-surface",
      ".desktop-dialog-surface",
      ".desktop-settings-switch",
      "::-webkit-scrollbar-thumb",
    ]) {
      expect(skin, selector).toContain(selector);
    }
  });

  it("loads Tiger last with Aqua, brushed-metal, pinstripe, and fixed-light treatments", () => {
    const entry = source("src/styles.css").trim();
    const skin = source("src/styles/macos-tiger.css");
    const firstPaint = source("public/initial-shell.css");

    expect(entry.endsWith('@import "./styles/macos-tiger.css";')).toBe(true);
    expect(skin).toContain(':root[data-interface-style="macos-tiger"]');
    expect(skin).toContain("--tiger-brushed-metal:");
    expect(skin).toContain("--tiger-pinstripe:");
    expect(skin).toContain("--tiger-aqua:");
    expect(skin).not.toContain(":not(.dark)");
    expect(skin).not.toContain(".desktop-theme-preview-surface).dark");
    expect(firstPaint).toContain(':root[data-interface-style="macos-tiger"]');
    for (const selector of [
      ".desktop-titlebar",
      ".desktop-explorer-toolbar",
      ".tree-row.selected",
      ".desktop-menu-surface",
      ".desktop-dialog-surface",
      ".desktop-settings-view",
      ".desktop-settings-switch",
      "::-webkit-scrollbar-thumb",
    ]) {
      expect(skin, selector).toContain(selector);
    }
  });

  it("keeps the switch copy complete in every supported locale", () => {
    const manifest = JSON.parse(source("locales/manifest.json")) as {
      locales: Array<{ locale: string }>;
    };

    for (const { locale } of manifest.locales) {
      const catalog = JSON.parse(source(`locales/renderer/${locale}/settings.json`)) as Record<string, string>;
      expect(catalog["appearance.interfaceStyle.title"], locale).toBeTruthy();
      expect(catalog["appearance.interfaceStyle.default"], locale).toBeTruthy();
      expect(catalog["appearance.interfaceStyle.macosTiger"], locale).toBeTruthy();
      expect(catalog["appearance.interfaceStyle.windowsXp"], locale).toBeTruthy();
      expect(catalog["appearance.theme.title"], locale).not.toBe(catalog["appearance.interfaceStyle.title"]);
    }
  });
});

function source(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}
