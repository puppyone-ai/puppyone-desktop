import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const titlebarCss = readFileSync(new URL("../src/styles/titlebar.css", import.meta.url), "utf8");
const tokensCss = readFileSync(new URL("../src/styles/tokens.css", import.meta.url), "utf8");

describe("titlebar typography architecture", () => {
  it("scopes the sky-blue titlebar surface to cloud workspaces", () => {
    const titlebarRule = readCssBlock(`\n${titlebarCss}`, ".desktop-titlebar");
    const cloudTitlebarRule = readCssBlock(
      titlebarCss,
      '.desktop-titlebar[data-workspace-kind="cloud"]',
    );

    expect(tokensCss).toContain("--po-header: var(--po-surface-editor);");
    expect(tokensCss).toContain("--po-cloud-titlebar-bg: #dbeaf1;");
    expect(tokensCss).toContain("--po-cloud-titlebar-bg: #263a45;");
    expect(titlebarRule).toContain("--desktop-titlebar-bg: var(--po-header);");
    expect(titlebarRule).toContain("background: var(--desktop-titlebar-bg);");
    expect(cloudTitlebarRule).toContain("--desktop-titlebar-bg: var(--po-cloud-titlebar-bg);");
    expect(cloudTitlebarRule).toContain("--desktop-titlebar-divider: var(--po-cloud-titlebar-divider);");
    expect(titlebarCss).not.toContain(".desktop-titlebar-workspace-button.cloud {");
  });

  it("keeps chrome text at the shared medium-weight contract", () => {
    const rootTokens = readCssBlock(tokensCss, ":root");

    expect(rootTokens).toContain("--po-text-weight-medium: 500;");
    expect(rootTokens).toContain("--po-font-weight-chrome: var(--po-text-weight-medium);");
  });

  it.each([
    ".desktop-titlebar-context-name",
    ".desktop-titlebar-workspace-name",
    ".desktop-titlebar-branch-button span",
  ])("binds %s to the shared chrome typography tokens", (selector) => {
    const rule = readCssBlock(titlebarCss, selector);

    expect(rule).toContain("font-size: var(--po-font-size-chrome, 13px);");
    expect(rule).toContain("font-weight: var(--po-font-weight-chrome, 500);");
    expect(rule).toContain("line-height: 18px;");
  });
});

function readCssBlock(css: string, selector: string): string {
  const marker = `\n${selector} {`;
  const start = css.indexOf(marker);
  if (start < 0) throw new Error(`Missing CSS block for ${selector}`);
  const bodyStart = start + marker.length;
  const end = css.indexOf("\n}", bodyStart);
  if (end < 0) throw new Error(`Unclosed CSS block for ${selector}`);
  return css.slice(bodyStart, end);
}
