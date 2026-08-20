import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("settings visual architecture", () => {
  it("keeps General app-scoped and moves project identity into Local Project", () => {
    const view = source("src/features/settings/SettingsView.tsx");
    const sidebarModel = source("src/features/settings/sidebar/settingsSidebarModel.ts");
    const types = source("src/features/settings/types.ts");
    const general = source("src/features/settings/main/GeneralSettingsView.tsx");
    const localAgents = source("src/features/local-agents/ui/LocalAgentsSettingsView.tsx");
    const activityAppearance = source("src/features/desktop-agent-presence/ui/AgentFileActivityAppearanceSetting.tsx");
    const activityPermission = source("src/features/desktop-agent-presence/ui/AgentFileActivityPermissionDialog.tsx");
    const localProject = source("src/features/settings/main/LocalProjectSettingsView.tsx");
    const language = source("src/features/settings/LanguageSetting.tsx");

    expect(types).toContain('"general" | "local-project"');
    expect(types).toContain('"appearance" | "local-agents"');
    expect(types).not.toContain('| "language"');
    expect(types).not.toContain('"workspace"');
    expect(view).toContain('if (activeSection === "general")');
    expect(view).toContain('if (activeSection === "local-agents")');
    expect(view).toContain('if (activeSection === "local-project")');
    expect(view).not.toContain('activeSection === "language"');
    expect(general).toContain("<LanguageSettingRow />");
    expect(general).toContain("<DesktopBuildVersionSettingsRow />");
    expect(general).toContain("<DesktopUpdateSettingsRow");
    expect(general).not.toContain("Workspace");
    expect(general).not.toContain("onUnlinkWorkspace");
    expect(general).not.toContain("AgentActivity");
    expect(general).not.toContain("localAgents");
    expect(localAgents).toContain('settings.localAgents.title');
    expect(localAgents).toContain("connection.displayName");
    expect(localAgents).toContain("desktop-settings-switch");
    expect(localAgents).toContain("discoverLocalAgents");
    expect(localAgents).not.toMatch(/AgentActivity|ActivityHook|agentFileActivity/u);
    expect(localAgents).not.toContain("desktop-settings-label-stack");
    expect(localAgents).not.toContain("<small>");
    expect(view).toContain("<AgentFileActivityAppearanceSetting");
    expect(activityAppearance).toContain("<AgentFileActivityPermissionDialog");
    expect(activityAppearance.indexOf("onChange(true)"))
      .toBeGreaterThan(activityAppearance.indexOf("await reconcileNativeActivityHooks({ enabled: true"));
    expect(activityPermission).toContain("DesktopDialogRoot");
    expect(activityPermission).toContain("permission.accessTitle");
    expect(activityPermission).not.toMatch(/providerId|providers\.map|connection\.displayName/u);
    expect(localProject).toContain("settings.localProject.path");
    expect(localProject).toContain("onUnlinkWorkspace");
    expect(localProject).not.toContain("DesktopBuildVersionSettingsRow");
    expect(localProject).not.toContain("LanguageSettingRow");

    const desktopAppItems = sidebarModel.slice(
      sidebarModel.indexOf('id: "desktop-app"'),
      sidebarModel.indexOf('\n  {\n    id: "local-project"', sidebarModel.indexOf('id: "desktop-app"') + 1),
    );
    expectInOrder(desktopAppItems, [
      'labelId: "settings.sidebar.general"',
      'labelId: "settings.sidebar.appearance"',
      'labelId: "settings.sidebar.localAgents"',
      'labelId: "settings.sidebar.defaultApps"',
      'labelId: "settings.sidebar.editor"',
      'labelId: "settings.sidebar.experimental"',
    ]);
    expect(desktopAppItems).not.toContain("settings.sidebar.language");
    expect(sidebarModel).toContain('labelId: "settings.sidebar.localProject"');
    expect(sidebarModel).toContain('labelId: "settings.sidebar.projectInfo"');

    expect(language).toContain("desktop-settings-select desktop-language-setting-select");
    expect(language).toContain("void changeLanguage(nextPreference)");
    expect(language).not.toContain("<SettingsSectionHeader");
    expect(language).not.toContain("<button");
  });

  it("keeps every supported locale complete for General and Local Project", () => {
    const manifest = JSON.parse(source("locales/manifest.json")) as {
      locales: Array<{ locale: string }>;
    };

    for (const { locale } of manifest.locales) {
      const catalog = JSON.parse(source(`locales/renderer/${locale}/settings.json`)) as Record<string, string>;
      expect(catalog["sidebar.language"], locale).toBeUndefined();
      expect(catalog["sidebar.localProject"], locale).toBeTruthy();
      expect(catalog["sidebar.projectInfo"], locale).toBeTruthy();
      expect(catalog["sidebar.localAgents"], locale).toBeTruthy();
      expect(catalog["general.title"], locale).toBeTruthy();
      expect(catalog["general.detail"], locale).toBeTruthy();
      expect(catalog["localAgents.title"], locale).toBeTruthy();
      expect(catalog["localAgents.toggle"], locale).toBeTruthy();
      expect(catalog["appearance.agentFileActivity.title"], locale).toBeTruthy();
      for (const key of [
        "title",
        "detail",
        "accessTitle",
        "accessDetail",
        "localOnly",
        "enable",
        "enabling",
        "error",
      ]) {
        expect(
          catalog[`appearance.agentFileActivity.permission.${key}`],
          `${locale}: settings.appearance.agentFileActivity.permission.${key}`,
        ).toBeTruthy();
      }
      for (const key of [
        "selectorLabel",
        "system",
        "changing",
        "changeFailed",
      ]) {
        expect(catalog[`language.${key}`], `${locale}: settings.language.${key}`).toBeTruthy();
      }
      for (const key of [
        "title",
        "detail",
        "name",
        "path",
        "mode",
        "modeLocal",
        "status",
        "protected",
        "recentWorkspace",
        "unlink.title",
        "unlink.action",
        "unlink.progress",
        "unlink.confirm",
      ]) {
        expect(catalog[`localProject.${key}`], `${locale}: settings.localProject.${key}`).toBeTruthy();
      }
    }
  });

  it("keeps version identity in Settings General and out of every Side Panel placement", () => {
    const general = source("src/features/settings/main/GeneralSettingsView.tsx");
    const footer = source("src/features/app-shell/navigation/DesktopSidebarFooterNavigation.tsx");
    const surface = source("src/features/app-shell/DesktopDataWorkspaceSurface.tsx");
    const dataShell = source("src/features/data-workspace/data-shell.css");

    expect(general).toContain("<DesktopBuildVersionSettingsRow />");
    expect(footer).not.toContain("DesktopBuildIdentity");
    expect(surface).not.toContain("DesktopBuildIdentity");
    expect(dataShell).not.toContain("desktop-build-identity-badge");
  });

  it("offers every loading animation preset from Appearance with localized labels", () => {
    const view = source("src/features/settings/SettingsView.tsx");
    const preferences = source("src/preferences.ts");
    const manifest = JSON.parse(source("locales/manifest.json")) as {
      locales: Array<{ locale: string }>;
    };

    expect(view).toContain("PULSE_GRID_PRESET_IDS.map");
    expect(view).toContain("PULSE_GRID_PRESET_FRAMES[presetId]");
    expect(view).toContain("onLoadingAnimationPresetChange(presetId)");
    expect(view.indexOf('settings.appearance.loadingAnimation.title'))
      .toBeGreaterThan(view.indexOf('settings.appearance.navigation.title'));
    expect(preferences).toContain('LOADING_ANIMATION_STORAGE_KEY = "puppyone.desktop.loadingAnimation"');

    for (const { locale } of manifest.locales) {
      const catalog = JSON.parse(source(`locales/renderer/${locale}/settings.json`)) as Record<string, string>;
      for (const key of [
        "title",
        "ariaLabel",
        "ikun.label",
        "ikun.description",
        "ymca.label",
        "ymca.description",
        "siu.label",
        "siu.description",
      ]) {
        expect(catalog[`appearance.loadingAnimation.${key}`], `${locale}: ${key}`).toBeTruthy();
      }
    }
  });

  it("uses one flat Settings contract and removes legacy card primitives", () => {
    const components = source("src/features/settings/components.tsx");
    const view = source("src/features/settings/SettingsView.tsx");
    const workspaceConfig = source("src/features/settings/PuppyoneWorkspaceConfigSettings.tsx");
    const splitViews = [
      "AccountSettingsView.tsx",
      "EditorSettingsViews.tsx",
      "FileSettingsViews.tsx",
      "GeneralSettingsView.tsx",
      "LocalProjectSettingsView.tsx",
      "RepositorySettingsViews.tsx",
    ].map((fileName) => source(`src/features/settings/main/${fileName}`)).join("\n");
    const settingsImplementation = `${components}\n${view}\n${workspaceConfig}\n${splitViews}`;
    const settings = source("src/styles/settings.css");

    expect(components).toContain("SettingsSubsection");
    expect(components).toContain("SettingsValueRow");
    expect(settingsImplementation).not.toMatch(/Settings(?:Group|Line)/);
    expect(settings).not.toContain(".desktop-settings-group");
    expect(settings).not.toContain(".desktop-settings-line");
    expect(settings).toMatch(/\.desktop-settings-subsection-body\s*{[^}]*display:\s*grid;/s);
    expect(settings).toMatch(/\.desktop-settings-subsection-title\s*{[^}]*font-size:\s*12px;[^}]*font-weight:\s*500;/s);

    for (const detailId of [
      "settings.appearance.detail",
      "settings.general.detail",
      "settings.localProject.detail",
      "settings.account.detail",
      "settings.editor.detail",
      "settings.experimental.detail",
      "settings.files.detail",
      "settings.defaultApps.detail",
      "settings.cloud.detail",
      "settings.git.detail",
    ]) {
      expect(settingsImplementation, detailId).toContain(detailId);
    }
  });

  it("locks the compact Appearance-derived dimensions and responsive rules", () => {
    const view = source("src/features/settings/SettingsView.tsx");
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
    expect(controls).toMatch(/\.desktop-appearance-option-segment\s*{[^}]*width:\s*min\(100%, 360px\);[^}]*grid-auto-columns:\s*minmax\(0, 1fr\);/s);
    expect(view.match(/desktop-theme-segment desktop-appearance-option-segment/g)).toHaveLength(6);
    expect(view).toContain("settings.appearance.editorPresentation.title");
    expect(controls).not.toContain(".desktop-loading-animation-segment");
    expect(controls).not.toContain(".desktop-text-size-segment");
    expect(controls).not.toContain(".desktop-sidebar-layout-segment");
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
