import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("pane-scoped external-open architecture", () => {
  it("keeps file-scoped actions out of the product Header", () => {
    const definition = source("src/features/app-shell/headerElements.tsx");
    const actions = source("src/features/app-shell/DesktopTitlebarActions.tsx");
    const app = source("src/App.tsx");
    const titlebarCss = source("src/styles/titlebar.css");
    const pane = source("src/features/editor-workbench/layout/EditorPaneShell.tsx");
    const updateButton = source("src/features/updates/DesktopUpdateTitlebarButton.tsx");

    expect(definition).not.toContain("external-open");
    expect(actions).not.toMatch(/editorFindCommand|csvViewSettings|activeFileExternalOpen/);
    expect(app).not.toMatch(/editorFindCommand|editorChromeContribution|activeExternalOpen/);
    expect(titlebarCss).not.toMatch(/desktop-titlebar-(?:external-open|csv-settings|editor-find)/);
    expect(pane).toContain("onOpenExternal");
    expect(pane).toContain("findCommand.open");
    expect(pane).toContain("menuContribution?.viewItems");
    expect(actions).toContain('group: "right-sidebar"');
    expect(actions).toContain('className="desktop-titlebar-action-divider"');
    expect(titlebarCss).toMatch(
      /\.desktop-titlebar-action-divider\s*\{[^}]*height:\s*18px;[^}]*margin-inline:\s*3px;[^}]*background:\s*var\(--desktop-titlebar-divider\);[^}]*\}/s,
    );
    expect(actions).toContain("DesktopUpdateTitlebarButton");
    expect(actions.indexOf('group: "app-status"')).toBeLessThan(
      actions.indexOf("for (const definition"),
    );
    expect(updateButton).toContain("if (!presentation) return null");
    expect(updateButton).toContain("strokeWidth={2.3}");
    expect(titlebarCss).toMatch(
      /\.desktop-titlebar-update\s*\{[^}]*width:\s*var\(--desktop-titlebar-control-height\);[^}]*background:\s*transparent;[^}]*color:\s*var\(--po-text-inverse\);[^}]*\}/s,
    );
    expect(titlebarCss).toMatch(
      /\.desktop-titlebar-update::before\s*\{[^}]*inset:\s*2px;[^}]*border-radius:\s*50%;[^}]*background:\s*var\(--po-accent\);[^}]*\}/s,
    );
    expect(titlebarCss).toContain(".desktop-titlebar-update-dot");
  });

  it("keeps application choice in Default Apps settings", () => {
    const settings = source("src/features/settings/main/FileSettingsViews.tsx");
    const target = source("src/features/external-apps/useExternalFileOpen.ts");

    expect(settings).toContain("chooseWorkspaceExternalApp");
    expect(settings).toContain("settings.defaultApps.fileTypeDefaults");
    expect(settings).toContain("upsertExternalAppOverride");
    expect(settings).toContain("removeExternalAppOverride");
    expect(target).toContain("openWorkspaceEntryExternal");
    expect(target).toContain("getExternalAppOverrideForExtension");
    expect(target).not.toContain("listWorkspaceExternalOpenTargets");
  });
});

function source(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}
