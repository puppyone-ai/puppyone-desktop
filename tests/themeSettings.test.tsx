import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("Sub Theme settings", () => {
  it("offers root-compatible visual variants without editor implementation controls", () => {
    const section = source("src/features/settings/main/SubThemeSettingsSection.tsx");

    expect(section).toContain("requestedSubThemeId");
    expect(section).toContain("effectiveSubThemeId");
    expect(section).toContain("rootThemeId");
    expect(section).toContain("effectiveColorMode");
    expect(section).toContain("onSubThemeChange");
    expect(section).toContain("getCompatibleSubThemes");
    expect(section).toContain("getCompatibleSubThemes(catalog.snapshot, rootThemeId, effectiveColorMode)");
    expect(section).toContain("desktop-sub-theme-mode-badge");
    expect(section).toContain("settings.appearance.themes.add");
    expect(section).toContain("THEME_MARKETPLACE_URL");
    expect(section).not.toContain("function ThemeSelector");
    expect(section).not.toContain("getThemesForTarget");
    expect(section).not.toContain("surfaceThemePreferences");
    expect(section).not.toContain("onThemeOverrideChange");
    expect(section).not.toContain("themes.reload");
    expect(section).not.toContain("CustomCssEditor");
    expect(section).not.toContain("settings.appearance.themes.detail");
    expect(section).toContain("catalog.openDirectory");
    expect(section).toContain("snapshot.diagnostics.map");
    expect(section).toContain("desktop-settings-select");
    const styles = source("src/styles/settings-controls.css");
    expect(styles).toMatch(/\.desktop-theme-pack-controls\s*\{[\s\S]*flex-wrap:\s*nowrap/);
    expect(styles).toMatch(/\.desktop-theme-pack-label\s*\{[^}]*color:\s*var\(--po-text-subtle\)/);
    expect(styles).toMatch(/\.desktop-theme-pack-controls\s*\{[\s\S]*width:\s*min\(100%,\s*360px\)/);
    expect(styles).toMatch(/\.desktop-theme-add-action\s*\{[\s\S]*white-space:\s*nowrap/);
    expect(section).toContain("desktop-theme-settings-action-row");
    expect(styles).toMatch(/\.desktop-theme-settings-action-row\s*\{[^}]*justify-content:\s*flex-end/);
    expect(styles).toMatch(/\.desktop-theme-settings-primary-actions\s*\{[^}]*width:\s*min\(100%,\s*360px\)[^}]*justify-content:\s*flex-end/);
    expect(styles).not.toMatch(/\.desktop-theme-settings-primary-actions\s*\{[^}]*background:\s*var\(--po-control\)/);
    expect(styles).toMatch(/\.desktop-theme-settings-primary-actions\s*>\s*\.desktop-settings-action\s*\{[^}]*flex:\s*0\s+0\s+auto[^}]*border:\s*1px\s+solid\s+var\(--po-divider\)/);
  });

  it("wires the catalog and preferences through the settings surface", () => {
    const app = source("src/App.tsx");
    const surface = source("src/features/settings/SettingsWorkspaceSurface.tsx");
    const view = source("src/features/settings/SettingsView.tsx");
    const editor = source("src/features/settings/main/EditorSettingsView.tsx");

    expect(app).toContain("subThemeCatalog={subThemeCatalog}");
    expect(surface).toContain("subThemeCatalog: SubThemeCatalogController");
    expect(surface).toContain("preferences.requestedSubThemeId");
    expect(surface).toContain("preferences.setSubThemeId");
    expect(surface).not.toContain("setSurfaceThemeOverride");
    expect(view).toContain("<SubThemeSettingsSection");
    expect(view).toContain("requestedSubThemeId={requestedSubThemeId}");
    expect(view.indexOf("<SubThemeSettingsSection")).toBeGreaterThan(view.indexOf('activeSection === "appearance"'));
    expect(view.indexOf("<SubThemeSettingsSection")).toBeGreaterThan(view.indexOf("<InterfacePaletteSettings"));
    expect(editor).not.toContain("ThemeSettingsSection");
  });
});
