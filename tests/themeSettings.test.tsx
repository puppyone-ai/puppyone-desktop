import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("CSS theme settings", () => {
  it("offers independent accessible selectors and theme folder management", () => {
    const section = source("src/features/settings/main/ThemeSettingsSection.tsx");

    for (const target of ["application", "markdown", "csv"]) {
      expect(section).toContain(`target="${target}"`);
      expect(section).toContain(`settings.editor.themes.${target}`);
    }
    expect(section).toContain("getThemesForTarget");
    expect(section).toContain("onThemeChange(target, event.currentTarget.value)");
    expect(section).toContain("onReload");
    expect(section).toContain("onOpenDirectory");
    expect(section).toContain("snapshot.diagnostics.map");
    expect(section).toContain("desktop-settings-select");
  });

  it("wires the catalog and preferences through the settings surface", () => {
    const app = source("src/App.tsx");
    const surface = source("src/features/settings/SettingsWorkspaceSurface.tsx");
    const view = source("src/features/settings/SettingsView.tsx");
    const editor = source("src/features/settings/main/EditorSettingsViews.tsx");

    expect(app).toContain("themeCatalog={themeCatalog}");
    expect(surface).toContain("themeCatalog: ThemeCatalogController");
    expect(surface).toContain("surfaceThemePreferences");
    expect(surface).toContain("onSurfaceThemeChange");
    expect(view).toContain("surfaceThemePreferences={surfaceThemePreferences}");
    expect(editor).toContain("<ThemeSettingsSection");
  });
});
