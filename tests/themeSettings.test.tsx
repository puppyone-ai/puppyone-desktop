import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("CSS theme settings", () => {
  it("offers one theme pack selector with advanced per-surface overrides", () => {
    const section = source("src/features/settings/main/ThemeSettingsSection.tsx");

    expect(section).toContain("preferences.pack");
    expect(section).toContain("onThemePackChange");
    expect(section).toContain("<details");
    for (const target of ["application", "markdown", "csv"]) {
      expect(section).toContain(`target="${target}"`);
      expect(section).toContain(`settings.appearance.themes.${target}`);
    }
    expect(section).toContain("getThemesForTarget");
    expect(section).toContain("preferences.overrides[target]");
    expect(section).toContain("onThemeOverrideChange");
    expect(section).toContain("onReload");
    expect(section).toContain("onOpenDirectory");
    expect(section).toContain("snapshot.diagnostics.map");
    expect(section).toContain("desktop-settings-select");
  });

  it("wires the catalog and preferences through the settings surface", () => {
    const app = source("src/App.tsx");
    const surface = source("src/features/settings/SettingsWorkspaceSurface.tsx");
    const view = source("src/features/settings/SettingsView.tsx");
    const editor = source("src/features/settings/main/EditorSettingsView.tsx");

    expect(app).toContain("themeCatalog={themeCatalog}");
    expect(surface).toContain("themeCatalog: ThemeCatalogController");
    expect(surface).toContain("surfaceThemePreferences");
    expect(surface).toContain("setThemePack");
    expect(surface).toContain("setSurfaceThemeOverride");
    expect(view).toContain("preferences={surfaceThemePreferences}");
    expect(view.indexOf("<ThemeSettingsSection")).toBeGreaterThan(view.indexOf('activeSection === "appearance"'));
    expect(editor).not.toContain("ThemeSettingsSection");
  });
});
