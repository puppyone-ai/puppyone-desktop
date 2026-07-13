import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("settings visual architecture", () => {
  it("keeps Language as a first-class Desktop App route between General and Appearance", () => {
    const view = source("src/features/settings/SettingsView.tsx");
    const types = source("src/features/settings/types.ts");
    const language = source("src/features/settings/LanguageSetting.tsx");
    const appearanceBranch = view.slice(
      view.indexOf('if (activeSection === "appearance")'),
      view.indexOf("function ThemePreview"),
    );

    expect(types).toContain('| "language"');
    expect(view).toContain('if (activeSection === "language")');
    expect(appearanceBranch).not.toContain("LanguageSettingsView");

    const desktopAppItems = view.slice(
      view.indexOf('id: "desktop-app"'),
      view.indexOf('\n  {\n    id: "workspace"', view.indexOf('id: "desktop-app"') + 1),
    );
    expectInOrder(desktopAppItems, [
      'labelId: "settings.sidebar.general"',
      'labelId: "settings.sidebar.language"',
      'labelId: "settings.sidebar.appearance"',
      'labelId: "settings.sidebar.defaultApps"',
      'labelId: "settings.sidebar.editor"',
      'labelId: "settings.sidebar.experimental"',
    ]);

    expect(language).toContain("<SettingsSectionHeader");
    expect(language).toContain("desktop-settings-select desktop-language-setting-select");
    expect(language).toContain("void changeLanguage(nextPreference)");
    expect(language).not.toContain("<button");
  });

  it("keeps every supported locale complete for the Language route and page", () => {
    const manifest = JSON.parse(source("locales/manifest.json")) as {
      locales: Array<{ locale: string }>;
    };

    for (const { locale } of manifest.locales) {
      const catalog = JSON.parse(source(`locales/renderer/${locale}/settings.json`)) as Record<string, string>;
      expect(catalog["sidebar.language"], locale).toBeTruthy();
      for (const key of [
        "title",
        "description",
        "selectorLabel",
        "system",
        "changing",
        "changeFailed",
      ]) {
        expect(catalog[`language.${key}`], `${locale}: settings.language.${key}`).toBeTruthy();
      }
    }
  });

  it("uses one flat Settings contract and removes legacy card primitives", () => {
    const components = source("src/features/settings/components.tsx");
    const view = source("src/features/settings/SettingsView.tsx");
    const workspaceConfig = source("src/features/settings/PuppyoneWorkspaceConfigSettings.tsx");
    const settings = source("src/styles/settings.css");

    expect(components).toContain("SettingsSubsection");
    expect(components).toContain("SettingsValueRow");
    expect(`${components}\n${view}\n${workspaceConfig}`).not.toMatch(/Settings(?:Group|Line)/);
    expect(settings).not.toContain(".desktop-settings-group");
    expect(settings).not.toContain(".desktop-settings-line");
    expect(settings).toMatch(/\.desktop-settings-subsection-body\s*{[^}]*display:\s*grid;/s);
    expect(settings).toMatch(/\.desktop-settings-subsection-title\s*{[^}]*font-size:\s*12px;[^}]*font-weight:\s*500;/s);

    for (const detailId of [
      "settings.appearance.detail",
      "settings.general.detail",
      "settings.account.detail",
      "settings.editor.detail",
      "settings.experimental.detail",
      "settings.files.detail",
      "settings.defaultApps.detail",
      "settings.cloud.detail",
      "settings.git.detail",
    ]) {
      expect(view, detailId).toContain(detailId);
    }
  });

  it("locks the compact Appearance-derived dimensions and responsive rules", () => {
    const settings = source("src/styles/settings.css");
    const controls = source("src/styles/settings-controls.css");
    const language = source("src/styles/settings-view.css");

    expect(settings).toMatch(/--desktop-settings-content-max-width:\s*1040px/);
    expect(settings).toMatch(/\.desktop-settings-section-header h2\s*{[^}]*font-size:\s*14px;[^}]*font-weight:\s*720;/s);
    expect(settings).toMatch(/\.desktop-settings-row\s*{[^}]*gap:\s*18px;[^}]*padding:\s*0 10px;/s);
    expect(controls).toMatch(/\.desktop-settings-row-control\s*{[^}]*min-height:\s*42px;/s);
    expect(controls).not.toContain("min-height: 38px");
    expect(settings).toMatch(/\.desktop-settings-value-row\s*{[^}]*min-height:\s*30px;/s);
    expect(settings).toMatch(/\.desktop-settings-select,[\s\S]*?height:\s*28px;[\s\S]*?border-radius:\s*6px;/);
    expect(controls).toMatch(/\.desktop-settings-action\s*{[^}]*height:\s*28px;[^}]*border-radius:\s*6px;[^}]*font-size:\s*12px;[^}]*font-weight:\s*650;/s);
    expect(controls).toMatch(/\.desktop-theme-segment\s*{[^}]*border-radius:\s*7px;/s);
    expect(controls).toMatch(/\.desktop-theme-segment button\s*{[^}]*height:\s*26px;[^}]*border-radius:\s*5px;/s);
    expect(settings).toContain("@media (max-width: 760px)");
    expect(settings).toContain(".desktop-settings-wide-control-row");

    expect(language).not.toContain("min(300px, 48%)");
    expect(language).not.toContain("min-height: 32px");
    expect(language).not.toContain("border-radius: 8px");
    expect(language).not.toContain("var(--po-panel-raised)");
    expect(language).toContain("width: min(100%, 220px)");
  });

  it("keeps hover feedback on interactive controls rather than layout rows", () => {
    const settings = source("src/styles/settings.css");
    const controls = source("src/styles/settings-controls.css");

    expect(settings).not.toContain(".desktop-settings-row:hover");
    expect(settings).not.toContain(".desktop-puppyone-config-row:hover");
    expect(settings).toContain(".desktop-settings-row-action:hover:not(:disabled)");
    expect(controls).toContain(".desktop-theme-segment button:hover");
    expect(controls).toContain(".desktop-theme-choice:hover");
  });
});

function source(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function expectInOrder(sourceText: string, needles: string[]) {
  let cursor = -1;
  for (const needle of needles) {
    const next = sourceText.indexOf(needle, cursor + 1);
    expect(next, needle).toBeGreaterThan(cursor);
    cursor = next;
  }
}
