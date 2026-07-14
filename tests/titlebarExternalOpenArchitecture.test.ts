import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("titlebar external-open architecture", () => {
  it("keeps the Header as a single default-app action", () => {
    const definition = source("src/features/app-shell/headerElements.tsx");
    const actions = source("src/features/app-shell/DesktopTitlebarActions.tsx");
    const app = source("src/App.tsx");
    const titlebarCss = source("src/styles/titlebar.css");

    expect(definition).toContain('className="desktop-titlebar-action desktop-titlebar-external-open"');
    expect(definition).toContain("onClick={externalOpen.onOpen}");
    expect(definition).not.toMatch(/DesktopMenu|ChevronDown|menuTargets|onCustomize|onOpenWithApp|setMenuOpen|aria-haspopup/);
    expect(actions).not.toMatch(/externalOpenTargets|externalOpenMenuOpen|onCustomizeExternalApp|onOpenActiveFileWithApp/);
    expect(app).not.toMatch(/externalOpenTargets=|onCustomizeExternalAppForActiveFile=|onOpenActiveFileWithApp=/);
    expect(titlebarCss).not.toMatch(/external-open-(?:main|menu-button|menu|row)/);
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
