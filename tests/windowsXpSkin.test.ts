import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parseInterfaceStyle } from "../src/preferences";

describe("Windows XP interface skin", () => {
  it("accepts only the curated interface style", () => {
    expect(parseInterfaceStyle("windows-xp")).toBe("windows-xp");
    expect(parseInterfaceStyle("default")).toBe("default");
    expect(parseInterfaceStyle("windows-7")).toBe("default");
    expect(parseInterfaceStyle(null)).toBe("default");
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
  });

  it("offers the Appearance switch without changing the shell composition", () => {
    const settings = source("src/features/settings/SettingsView.tsx");
    const interfaceStyleSetting = source("src/features/settings/main/InterfaceStyleSetting.tsx");
    const shell = source("src/components/DesktopCloudShell.tsx");

    expect(settings).toContain("<InterfaceStyleSetting");
    expect(interfaceStyleSetting).toContain('checked={value === "windows-xp"}');
    expect(interfaceStyleSetting).toContain('onChange(event.target.checked ? "windows-xp" : "default")');
    expect(shell).not.toContain("windows-xp");
  });

  it("loads a final skin layer with light, dark, chrome, control, menu, and dialog treatments", () => {
    const entry = source("src/styles.css").trim();
    const skin = source("src/styles/windows-xp.css");

    expect(entry.endsWith('@import "./styles/windows-xp.css";')).toBe(true);
    expect(skin).toContain(':root[data-interface-style="windows-xp"]');
    expect(skin).toContain(":not(.dark)");
    expect(skin).toContain(".desktop-theme-preview-surface).dark");
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

  it("keeps the switch copy complete in every supported locale", () => {
    const manifest = JSON.parse(source("locales/manifest.json")) as {
      locales: Array<{ locale: string }>;
    };

    for (const { locale } of manifest.locales) {
      const catalog = JSON.parse(source(`locales/renderer/${locale}/settings.json`)) as Record<string, string>;
      expect(catalog["appearance.interfaceStyle.title"], locale).toBeTruthy();
      expect(catalog["appearance.interfaceStyle.detail"], locale).toBeTruthy();
    }
  });
});

function source(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}
