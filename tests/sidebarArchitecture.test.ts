import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const cascadeCss = read("../src/styles/cascade.css");
const sharedSidebarCss = read("../packages/shared-ui/src/styles/sidebar-primitives.css");
const patternCss = read("../src/styles/sidebar/patterns.css");
const dataSurfaceSource = read("../src/features/app-shell/DesktopDataWorkspaceSurface.tsx");
const workspaceContentSource = read("../src/features/app-shell/DesktopWorkspaceContent.tsx");
const registrySource = read("../src/features/app-shell/workspace-surfaces/workspaceSurfaceRegistry.ts");
const auxiliaryHostSource = read("../src/features/app-shell/auxiliary/AuxiliaryPanelHost.tsx");
const settingsSidebarSource = read("../src/features/settings/sidebar/SettingsSidebar.tsx");
const settingsModelSource = read("../src/features/settings/sidebar/settingsSidebarModel.ts");
const sourceControlResourceLists = read("../src/features/source-control/sidebar/SourceControlResourceLists.tsx");
const cloudHistorySidebar = read("../src/features/cloud/history/CloudHistorySidebar.tsx");
const virtualizationPolicy = read("../packages/shared-ui/src/sidebar/virtualizationPolicy.ts");

describe("Sidebar architecture", () => {
  it("keeps the dependency direction and CSS ownership explicit", () => {
    expect(cascadeCss.trim()).toBe("@layer reset, tokens, primitives, patterns, features, overrides;");
    expect(sharedSidebarCss).toContain("@layer primitives");
    expect(patternCss).toContain("@layer patterns");
    expect(sharedSidebarCss).not.toContain("desktop-tool-sidebar");
    expect(patternCss).not.toContain("desktop-tool-sidebar");
    expect(sharedSidebarCss).toContain("padding-inline:");
    expect(sharedSidebarCss).not.toMatch(/\bleft\s*:/);
    expect(sharedSidebarCss).not.toMatch(/\bright\s*:/);
  });

  it("keeps Data alive and projects one resolved surface into both regions", () => {
    expect(workspaceContentSource).toContain("useWorkspaceSurfaceContent");
    expect(workspaceContentSource).not.toMatch(/activeView\s*===/);
    expect(dataSurfaceSource).toContain("<DataWorkspace");
    expect(dataSurfaceSource).toContain('resolvedSurface.id === "data"');
    expect(dataSurfaceSource.match(/<WorkspaceSurfaceOutlet/g)).toHaveLength(2);
    expect(registrySource).toContain('lifecycle: { sidebar: "keep-alive", main: "keep-alive" }');
    expect(registrySource).not.toMatch(/\b(?:agent|terminal)\b/i);
  });

  it("keeps Feature composition out of shared layers and Auxiliary routing independent", () => {
    expect(sharedSidebarCss).not.toMatch(/desktop-(?:git|cloud|settings|agent|terminal)/);
    expect(auxiliaryHostSource).toContain("SidebarResizeHandle");
    expect(auxiliaryHostSource).toContain("usePaneResizeDrag");
    expect(auxiliaryHostSource).toContain('orientation="vertical"');
    expect(settingsSidebarSource).toContain("SETTINGS_SIDEBAR_GROUPS.map");
    expect(settingsModelSource).toContain("SETTINGS_SIDEBAR_GROUPS");
  });

  it("enforces one large-list policy with a bounded mounted-row budget", () => {
    expect(virtualizationPolicy).toContain("SIDEBAR_VIRTUALIZATION_THRESHOLD = 200");
    expect(virtualizationPolicy).toContain("SIDEBAR_VIRTUALIZATION_MAX_MOUNTED_ROWS = 120");
    expect(sourceControlResourceLists).toContain("shouldVirtualizeSidebarList");
    expect(sourceControlResourceLists).toContain("VirtualSidebarList");
    expect(cloudHistorySidebar).toContain("VirtualSidebarList");
  });

  it.each([
    ["light", "small", "narrow"],
    ["light", "default", "default"],
    ["light", "large", "wide"],
    ["dark", "small", "narrow"],
    ["dark", "default", "default"],
    ["dark", "large", "wide"],
  ])("retains the %s/%s/%s visual contract in shared semantic tokens", (theme, textSize, width) => {
    expect(["light", "dark"]).toContain(theme);
    expect(["small", "default", "large"]).toContain(textSize);
    expect(["narrow", "default", "wide"]).toContain(width);
    expect(sharedSidebarCss).toContain("var(--desktop-sidebar-font-size");
    expect(sharedSidebarCss).toContain("var(--desktop-sidebar-row-height)");
    expect(sharedSidebarCss).toContain("min-width: 0;");
    expect(sharedSidebarCss).toContain("text-overflow: ellipsis;");
  });
});

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}
