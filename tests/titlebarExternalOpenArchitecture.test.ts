import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("titlebar external-open architecture", () => {
  it("keeps the Header as a single default-app action", () => {
    const definition = source("src/features/app-shell/headerElements.tsx");
    const actions = source("src/features/app-shell/DesktopTitlebarActions.tsx");
    const app = source("src/App.tsx");
    const titlebarCss = source("src/styles/titlebar.css");
    const updateButton = source("src/features/updates/DesktopUpdateTitlebarButton.tsx");

    expect(definition).toContain('className="desktop-titlebar-action desktop-titlebar-external-open"');
    expect(definition).toContain("onClick={externalOpen.onOpen}");
    expect(definition).not.toMatch(/DesktopMenu|ChevronDown|menuTargets|onCustomize|onOpenWithApp|setMenuOpen|aria-haspopup/);
    expect(actions).not.toMatch(/externalOpenTargets|externalOpenMenuOpen|onCustomizeExternalApp|onOpenActiveFileWithApp/);
    expect(app).not.toMatch(/externalOpenTargets=|onCustomizeExternalAppForActiveFile=|onOpenActiveFileWithApp=/);
    expect(titlebarCss).not.toMatch(/external-open-(?:main|menu-button|menu|row)/);
    expect(titlebarCss).toMatch(
      /\.desktop-titlebar-external-open\s*\{[^}]*width:\s*var\(--desktop-titlebar-control-height\);[^}]*\}/s,
    );
    expect(actions).toContain('group: "right-sidebar"');
    expect(actions).toContain('className="desktop-titlebar-action-divider"');
    expect(titlebarCss).toMatch(
      /\.desktop-titlebar-action-divider\s*\{[^}]*height:\s*18px;[^}]*margin-inline:\s*3px;[^}]*background:\s*var\(--desktop-titlebar-divider\);[^}]*\}/s,
    );
    expect(actions).toContain("DesktopUpdateTitlebarButton");
    expect(actions.indexOf('group: "app-status"')).toBeLessThan(
      actions.indexOf("if (editorFindCommand)"),
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
    const target = source("src/features/external-apps/useActiveExternalOpenTarget.ts");

    expect(settings).toContain("chooseWorkspaceExternalApp");
    expect(settings).toContain("settings.defaultApps.fileTypeDefaults");
    expect(settings).toContain("upsertExternalAppOverride");
    expect(settings).toContain("removeExternalAppOverride");
    expect(target).toContain("resolveWorkspaceExternalOpenTarget");
    expect(target).not.toContain("listWorkspaceExternalOpenTargets");
  });
});

function source(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}
