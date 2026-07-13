import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tokensCss = readCss("../src/styles/tokens.css");
const layoutCss = readCss("../src/styles/layout.css");
const titlebarCss = readCss("../src/styles/titlebar.css");
const sidebarPrimitivesCss = readCss("../src/styles/sidebar-primitives.css");
const dataAdapterCss = readCss("../src/features/data-workspace/browser.css");
const dataTreeCss = readCss("../packages/shared-ui/src/styles/data-workspace.css");
const dataWorkspaceSource = readFileSync(
  new URL("../packages/shared-ui/src/data/DataWorkspace.tsx", import.meta.url),
  "utf8",
);
const desktopWorkspaceContentSource = readFileSync(
  new URL("../src/features/app-shell/DesktopWorkspaceContent.tsx", import.meta.url),
  "utf8",
);
const settingsSidebarSource = readFileSync(
  new URL("../src/features/settings/SettingsView.tsx", import.meta.url),
  "utf8",
);
const cloudSidebarSource = readFileSync(
  new URL("../src/features/cloud/CloudServiceSidebar.tsx", import.meta.url),
  "utf8",
);
const agentFoundationCss = readCss("../src/features/desktop-agent/ui/styles/foundation.css");
const sidebarBaseCss = readCss("../src/features/source-control/styles/sidebar-base.css");
const gitLayoutCss = readCss("../src/features/source-control/styles/sidebar-layout.css");
const gitResourcesCss = readCss("../src/features/source-control/styles/sidebar-resources.css");
const gitHistoryCss = readCss("../src/features/source-control/styles/history-list.css");
const settingsCss = readCss("../src/styles/settings-view.css");
const cloudSidebarCss = readCss("../src/features/cloud/styles/sidebar-shell.css");
const cloudHistorySidebarCss = readCss("../src/features/cloud/history/styles/sidebar.css");
const accessScopeCss = readCss("../src/features/cloud/styles/access/scope-sidebar.css");
const accessServiceCss = readCss("../src/features/cloud/styles/access/service-sidebar.css");
const accessLegacyCss = readCss("../src/features/cloud/styles/access/legacy-detail.css");
const changesCss = readCss("../src/features/changes/changes.css");
const legacyCloudSidebarCss = readCss("../src/features/cloud/legacy-sidebar.css");

describe("sidebar spacing architecture", () => {
  it("gives the Explorer host sole ownership of the sidebar divider", () => {
    const explorerColumn = compact(readCssBlock(dataTreeCss, ".explorer-column"));
    const injectedSurface = compact(readCssBlock(layoutCss, ".desktop-view-surface-sidebar"));
    const accessSidebar = compact(readCssBlock(
      accessServiceCss,
      ".desktop-cloud-service-sidebar.desktop-cloud-access-scope-sidebar",
    ));

    expect(dataWorkspaceSource).toContain('<aside className="explorer-column">');
    expect(dataWorkspaceSource).toContain("renderWorkspaceSlot(explorerSlot, workspaceState)");
    expect(desktopWorkspaceContentSource).toContain(
      'className="desktop-view-surface desktop-view-surface-sidebar"',
    );
    expect(explorerColumn).toContain(
      "border-inline-end: 1px solid var(--po-shell-divider, var(--po-divider));",
    );
    expect(injectedSurface).not.toContain("border-inline-end:");
    expect(accessSidebar).not.toContain("border-inline-end:");
  });

  it("defines one visual edge contract", () => {
    const root = readCssBlock(tokensCss, ":root");
    const semanticThemeScope = readCssBlock(
      tokensCss,
      ":root,\n:where(.app-shell, .onboarding-shell, .desktop-overlay-root, .desktop-theme-preview-surface, .dark)",
    );

    expect(root).toContain("--desktop-sidebar-row-left-gap: 12px;");
    expect(root).toContain("--desktop-sidebar-row-right-gap: 12px;");
    expect(root).toContain("--desktop-sidebar-row-radius: 6px;");
    expect(root).toContain("--desktop-sidebar-row-content-left: 6px;");
    expect(root).toContain("--desktop-sidebar-row-content-right: 6px;");
    expect(root).toContain("--desktop-sidebar-list-padding-block: 8px;");
    expect(root).toContain("--desktop-sidebar-font-size: var(--po-text-size-sidebar);");
    expect(root).toContain("--desktop-sidebar-font-size-meta: var(--po-text-size-meta);");
    expect(root).toContain("--desktop-sidebar-section-title-font-size: var(--po-text-size-meta);");
    expect(root).toContain("--desktop-sidebar-section-title-font-weight: var(--po-text-weight-medium);");
    expect(root).toContain("--desktop-sidebar-section-title-line-height: 18px;");
    expect(semanticThemeScope).toContain(
      "--desktop-sidebar-section-title-font-size: var(--po-text-size-meta);",
    );
    expect(semanticThemeScope).toContain(
      "--desktop-sidebar-section-title-color: var(--po-text-subtle);",
    );
    expect(semanticThemeScope).toContain(
      "--desktop-sidebar-section-title-disabled-color: var(--po-text-disabled);",
    );
    expect(root).toContain("--desktop-sidebar-font-weight: var(--po-text-weight-medium);");
    expect(root).toContain("--desktop-sidebar-font-weight-emphasis: 650;");
    expect(root).toContain("--desktop-sidebar-line-height: 18px;");
    expect(root).toContain("--desktop-sidebar-icon-label-gap: 4px;");
    expect(semanticThemeScope).toContain(
      "--po-shell-divider: color-mix(in srgb, var(--po-text) 10%, transparent);",
    );
    expect(semanticThemeScope).toContain(
      "--po-sidebar-divider: color-mix(in srgb, var(--po-text) 7.5%, transparent);",
    );
    expect(semanticThemeScope).toContain("--po-header-divider: var(--po-shell-divider);");
    expect(semanticThemeScope).toContain(
      "--po-cloud-titlebar-divider: var(--po-shell-divider);",
    );
    expect(compact(root)).toContain(compact(`
      --desktop-sidebar-scroll-right-gap: calc(
        var(--desktop-sidebar-row-right-gap) - var(--desktop-sidebar-scrollbar-width)
      );
    `));
  });

  it("uses one stronger frame divider and one quieter sidebar divider", () => {
    const semanticThemeScope = readCssBlock(
      tokensCss,
      ":root,\n:where(.app-shell, .onboarding-shell, .desktop-overlay-root, .desktop-theme-preview-surface, .dark)",
    );
    const titlebar = compact(readCssBlock(titlebarCss, ".desktop-titlebar"));
    const rightSidebar = compact(readCssBlock(layoutCss, ".desktop-right-sidebar.is-open"));
    const sharedGroupDivider = compact(readCssBlock(
      sidebarPrimitivesCss,
      ".desktop-tool-sidebar-group + .desktop-tool-sidebar-group::before",
    ));
    const sharedGroupTitle = compact(readCssBlock(
      sidebarPrimitivesCss,
      ".desktop-tool-sidebar-group-title",
    ));
    const gitSectionTitle = compact(readCssBlock(
      gitResourcesCss,
      ".desktop-git-section-title",
    ));
    const gitSectionTitleText = compact(readCssBlock(
      gitResourcesCss,
      ".desktop-git-section-title span",
    ));
    const cloudList = compact(readCssBlock(
      cloudSidebarCss,
      ".desktop-cloud-sidebar-list",
    ));
    const cloudHistoryHeader = compact(readCssBlock(
      cloudHistorySidebarCss,
      ".desktop-cloud-history-sidebar-header",
    ));

    expect(semanticThemeScope).toContain(
      "--po-shell-divider: color-mix(in srgb, var(--po-text) 10%, transparent);",
    );
    expect(semanticThemeScope).toContain(
      "--po-sidebar-divider: color-mix(in srgb, var(--po-text) 7.5%, transparent);",
    );
    expect(tokensCss.match(/--po-shell-divider:/g)).toHaveLength(1);
    expect(tokensCss.match(/--po-sidebar-divider:/g)).toHaveLength(1);
    expect(tokensCss).not.toMatch(/--po-header-divider:\s*rgba/);
    expect(titlebar).toContain("--desktop-titlebar-divider: var(--po-header-divider);");
    expect(rightSidebar).toContain(
      "border-inline-start-color: var(--po-shell-divider, var(--po-divider));",
    );
    expect(sharedGroupDivider).toContain(
      "background: var(--po-sidebar-divider, var(--po-divider));",
    );
    expect(sharedGroupDivider).toContain(
      "inset-inline: calc(-1 * var(--desktop-sidebar-row-left-gap)) calc(-1 * var(--desktop-sidebar-row-right-gap));",
    );
    expect(sharedGroupTitle).toContain(
      "font-size: var(--desktop-sidebar-section-title-font-size, var(--po-text-size-meta, 12px));",
    );
    expect(sharedGroupTitle).toContain(
      "font-weight: var(--desktop-sidebar-section-title-font-weight, var(--po-text-weight-medium, 500));",
    );
    expect(gitSectionTitle).toContain(
      "color: var(--desktop-sidebar-section-title-color, var(--po-text-subtle));",
    );
    expect(gitSectionTitle).toContain(
      "font-size: var(--desktop-sidebar-section-title-font-size, var(--git-font-small));",
    );
    expect(gitSectionTitle).toContain(
      "font-weight: var(--desktop-sidebar-section-title-font-weight, var(--git-weight-regular));",
    );
    expect(gitSectionTitle).toContain(
      "line-height: var(--desktop-sidebar-section-title-line-height, var(--git-line-height));",
    );
    expect(gitSectionTitleText).toContain(
      "font-size: var(--desktop-sidebar-section-title-font-size, var(--git-font-small));",
    );
    expect(cloudList).toContain(
      "padding-inline: var(--desktop-sidebar-row-left-gap) var(--desktop-sidebar-scroll-right-gap);",
    );
    expect(cloudList).not.toContain("--desktop-sidebar-row-right-gap:");
    expect(cloudSidebarCss).not.toContain(".desktop-cloud-sidebar-nav-row.locked");
    expect(settingsSidebarSource).toContain('className="desktop-tool-sidebar-group"');
    expect(cloudSidebarSource).toContain('className="desktop-tool-sidebar-group"');
    expect(settingsCss).not.toContain("desktop-settings-sidebar-group");
    expect(cloudSidebarCss).not.toContain("desktop-cloud-sidebar-separator");
    expect(cloudHistoryHeader).toContain(
      "border-bottom: 1px solid var(--po-sidebar-divider, var(--po-divider));",
    );
  });

  it("maps the Data tree onto the shared edge contract", () => {
    const adapter = readCssBlock(dataAdapterCss, ".desktop-data-workspace-wrap");
    const list = compact(readCssBlock(dataTreeCss, ".explorer-tree-list"));
    const treeRow = compact(readCssBlock(dataTreeCss, ".tree-row"));

    expect(adapter).toContain("--po-tree-row-left-gap: var(--desktop-sidebar-row-left-gap);");
    expect(adapter).toContain("--po-tree-row-right-gap: var(--desktop-sidebar-row-right-gap);");
    expect(adapter).toContain("--po-tree-row-radius: var(--desktop-sidebar-row-radius);");
    expect(adapter).toContain("--po-tree-no-root-top-gap: var(--desktop-sidebar-list-padding-block);");
    expect(adapter).toContain("--po-tree-list-bottom-gap: var(--desktop-sidebar-list-padding-block);");
    expect(adapter).toContain("--po-tree-row-icon-label-gap: var(--desktop-sidebar-icon-label-gap);");
    expect(adapter).toContain("--po-tree-row-font-size: var(--desktop-sidebar-font-size);");
    expect(adapter).toContain("--po-tree-row-font-weight: var(--desktop-sidebar-font-weight);");
    expect(adapter).toContain("--po-tree-row-line-height: var(--desktop-sidebar-line-height);");
    expect(treeRow).toContain("font-size: var(--tree-row-font-size);");
    expect(treeRow).toContain("font-weight: var(--tree-row-font-weight);");
    expect(treeRow).toContain("line-height: var(--tree-row-line-height);");
    expect(list).toContain("padding-block: 0 var(--tree-list-bottom-gap);");
    expect(list).toContain(compact(`
      padding-inline: var(--tree-row-left-gap)
        calc(var(--tree-row-right-gap) - var(--tree-scrollbar-width));
    `));
  });

  it("keeps Data row colors authoritative while Agent mirrors them one way", () => {
    const treeShell = compact(readCssBlock(dataTreeCss, ".explorer-tree-shell"));
    const agentBoundary = compact(readCssBlock(
      agentFoundationCss,
      ".desktop-agent-boundary,\n.desktop-agent-overlay",
    ));

    expect(treeShell).toContain(
      "--tree-row-hover-bg: var(--po-tree-row-hover-bg, color-mix(in srgb, var(--po-hover) 86%, transparent));",
    );
    expect(treeShell).toContain(
      "color-mix(in srgb, var(--po-selected) 96%, transparent) 0%",
    );
    expect(tokensCss).not.toContain("--desktop-sidebar-row-hover-bg");
    expect(tokensCss).not.toContain("--desktop-sidebar-row-selected-bg");
    expect(dataAdapterCss).not.toContain("--po-tree-row-hover-bg:");
    expect(dataAdapterCss).not.toContain("--po-tree-row-selected-bg:");
    expect(agentBoundary).toContain(
      "--agent-row-hover-surface: color-mix(in srgb, var(--po-hover) 86%, transparent);",
    );
    expect(agentBoundary).not.toContain("--po-tree-row-hover-bg:");
    expect(agentBoundary).not.toContain("--po-tree-row-selected-bg:");
  });

  it("draws every ancestor guide column with one depth-bounded layer", () => {
    const guide = compact(readCssBlock(
      dataTreeCss,
      '.explorer-tree-motion-shell:not([data-depth="0"])::before',
    ));

    expect(guide).toContain(compact(`
      left: calc(
        var(--tree-row-content-left)
        + var(--tree-icon-slot-size) / 2
      );
    `));
    expect(guide).toContain(
      "width: calc(var(--depth, 0) * var(--tree-row-indent));",
    );
    expect(guide).toContain(compact(`
      background-image: linear-gradient(
        to right,
        var(--po-tree-guide) 0 1px,
        transparent 1px
      );
    `));
    expect(guide).toContain("background-repeat: repeat-x;");
    expect(guide).toContain("background-size: var(--tree-row-indent) 100%;");
    expect(guide).not.toContain("- var(--tree-row-indent)");
  });

  it("keeps Settings on the shared scroll-list padding", () => {
    const list = compact(readCssBlock(sidebarBaseCss, ".desktop-tool-sidebar-list"));

    expect(list).toContain("padding-block: var(--desktop-sidebar-list-padding-block);");
    expect(list).toContain(
      "padding-inline: var(--desktop-sidebar-row-left-gap) var(--desktop-sidebar-scroll-right-gap);",
    );
    expect(settingsCss).not.toMatch(/\.desktop-settings-sidebar\s+\.desktop-tool-sidebar-list\s*\{/);
  });

  it("keeps Git edges shared while nested lists own scrolling", () => {
    const wrapper = compact(readCssBlock(gitLayoutCss, ".desktop-git-sidebar-list"));
    const footer = compact(readCssBlock(gitHistoryCss, ".desktop-git-history-drawer"));

    expect(wrapper).toContain("padding-block: var(--desktop-sidebar-list-padding-block) 0;");
    expect(wrapper).toContain("padding-inline: 0;");
    expect(wrapper).toContain("scrollbar-gutter: auto;");
    expect(footer).toContain("padding-block: 3px var(--desktop-sidebar-list-padding-block);");
    expect(footer).toContain(
      "padding-inline: var(--git-sidebar-left-gap) var(--git-sidebar-right-gap);",
    );
  });

  it("keeps every remaining page-level sidebar on the shared block edge", () => {
    expectBlockPadding(
      cloudSidebarCss,
      ".desktop-cloud-sidebar-list",
      "var(--desktop-sidebar-row-left-gap) var(--desktop-sidebar-scroll-right-gap)",
    );
    expectBlockPadding(accessScopeCss, ".desktop-cloud-access-scope-list", "0");
    expectBlockPadding(
      accessServiceCss,
      ".desktop-cloud-service-sidebar .desktop-cloud-access-scope-list",
      "0",
    );
    expectBlockPadding(accessLegacyCss, ".desktop-cloud-access-scope-list", "8px");
    expectBlockPadding(changesCss, ".review-list", "0");
    expectBlockPadding(legacyCloudSidebarCss, ".cloud-nav", "6px");
  });
});

function readCss(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function readCssBlock(css: string, selector: string): string {
  const marker = `${selector} {`;
  const lineMarker = `\n${marker}`;
  const lineStart = css.indexOf(lineMarker);
  const start = css.startsWith(marker) ? 0 : lineStart >= 0 ? lineStart + 1 : -1;
  if (start < 0) throw new Error(`Missing CSS block for ${selector}`);
  const bodyStart = start + marker.length;
  const end = css.indexOf("\n}", bodyStart);
  if (end < 0) throw new Error(`Unclosed CSS block for ${selector}`);
  return css.slice(bodyStart, end);
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function expectBlockPadding(css: string, selector: string, inlinePadding: string) {
  const rule = compact(readCssBlock(css, selector));
  expect(rule).toContain("padding-block: var(--desktop-sidebar-list-padding-block);");
  expect(rule).toContain(`padding-inline: ${inlinePadding};`);
}
