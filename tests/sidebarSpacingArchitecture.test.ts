import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tokensCss = readCss("../src/styles/tokens.css");
const dataAdapterCss = readCss("../src/features/data-workspace/browser.css");
const dataTreeCss = readCss("../vendor/shared-ui/src/styles/data-workspace.css");
const sidebarBaseCss = readCss("../src/features/source-control/styles/sidebar-base.css");
const gitLayoutCss = readCss("../src/features/source-control/styles/sidebar-layout.css");
const gitHistoryCss = readCss("../src/features/source-control/styles/history-list.css");
const settingsCss = readCss("../src/styles/settings-view.css");
const cloudSidebarCss = readCss("../src/features/cloud/styles/sidebar-shell.css");
const accessScopeCss = readCss("../src/features/cloud/styles/access/scope-sidebar.css");
const accessServiceCss = readCss("../src/features/cloud/styles/access/service-sidebar.css");
const accessLegacyCss = readCss("../src/features/cloud/styles/access/legacy-detail.css");
const changesCss = readCss("../src/features/changes/changes.css");
const legacyCloudSidebarCss = readCss("../src/features/cloud/legacy-sidebar.css");

describe("sidebar spacing architecture", () => {
  it("defines one visual edge contract", () => {
    const root = readCssBlock(tokensCss, ":root");

    expect(root).toContain("--desktop-sidebar-row-left-gap: 12px;");
    expect(root).toContain("--desktop-sidebar-row-right-gap: 12px;");
    expect(root).toContain("--desktop-sidebar-row-content-left: 6px;");
    expect(root).toContain("--desktop-sidebar-row-content-right: 6px;");
    expect(root).toContain("--desktop-sidebar-list-padding-block: 8px;");
    expect(compact(root)).toContain(compact(`
      --desktop-sidebar-scroll-right-gap: calc(
        var(--desktop-sidebar-row-right-gap) - var(--desktop-sidebar-scrollbar-width)
      );
    `));
  });

  it("maps the Data tree onto the shared edge contract", () => {
    const adapter = readCssBlock(dataAdapterCss, ".desktop-data-workspace-wrap");
    const list = compact(readCssBlock(dataTreeCss, ".explorer-tree-list"));

    expect(adapter).toContain("--po-tree-row-left-gap: var(--desktop-sidebar-row-left-gap);");
    expect(adapter).toContain("--po-tree-row-right-gap: var(--desktop-sidebar-row-right-gap);");
    expect(adapter).toContain("--po-tree-no-root-top-gap: var(--desktop-sidebar-list-padding-block);");
    expect(adapter).toContain("--po-tree-list-bottom-gap: var(--desktop-sidebar-list-padding-block);");
    expect(list).toContain("padding-block: 0 var(--tree-list-bottom-gap);");
    expect(list).toContain(compact(`
      padding-inline: var(--tree-row-left-gap)
        calc(var(--tree-row-right-gap) - var(--tree-scrollbar-width));
    `));
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
    expectBlockPadding(cloudSidebarCss, ".desktop-cloud-sidebar-list", "0");
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
