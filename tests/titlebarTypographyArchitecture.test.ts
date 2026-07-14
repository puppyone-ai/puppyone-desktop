import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const titlebarCss = readFileSync(new URL("../src/styles/titlebar.css", import.meta.url), "utf8");
const tokensCss = readFileSync(new URL("../src/styles/tokens.css", import.meta.url), "utf8");
const titlebarContextSource = readFileSync(
  new URL("../src/features/app-shell/DesktopTitlebarContext.tsx", import.meta.url),
  "utf8",
);
const workspaceSwitcherSource = readFileSync(
  new URL("../src/features/app-shell/DesktopWorkspaceSwitcher.tsx", import.meta.url),
  "utf8",
);

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
    expect(rootTokens).toContain("--desktop-chrome-control-size: 30px;");
    expect(rootTokens).toContain("--desktop-toolbar-action-radius: 5px;");
    expect(rootTokens).toContain("--desktop-titlebar-control-height: 24px;");
    expect(rootTokens).toContain("--desktop-titlebar-tool-action-width: 34px;");
  });

  it("uses the compact titlebar height without shrinking shared sidebar controls", () => {
    const action = readCssBlock(titlebarCss, ".desktop-titlebar-action");
    const workspace = readCssBlock(titlebarCss, ".desktop-titlebar-workspace-button");
    const branch = readCssBlock(titlebarCss, ".desktop-titlebar-branch-button");

    expect(action).toContain("width: var(--desktop-chrome-control-size);");
    expect(action).toContain("height: var(--desktop-titlebar-control-height);");
    expect(action).toContain("border-radius: var(--desktop-toolbar-action-radius);");
    expect(workspace).toContain("height: var(--desktop-titlebar-control-height);");
    expect(workspace).toContain("border-radius: var(--desktop-toolbar-action-radius);");
    expect(branch).toContain("height: var(--desktop-titlebar-control-height);");
    expect(branch).toContain("border-radius: var(--desktop-toolbar-action-radius);");
  });

  it("gives the two right-sidebar tools a wider normal-titlebar target", () => {
    const toolActions = readCssBlock(
      titlebarCss,
      ".desktop-titlebar-actions .desktop-titlebar-terminal,\n.desktop-titlebar-actions .desktop-titlebar-agent-chat",
    );

    expect(toolActions).toContain("width: var(--desktop-titlebar-tool-action-width);");
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

  it("keeps the project quiet and distinguishes the branch with its semantic glyph", () => {
    const context = readCssBlock(titlebarCss, ".desktop-titlebar-context");
    const projectName = readCssBlock(titlebarCss, ".desktop-titlebar-workspace-name");
    const branchButton = readCssBlock(titlebarCss, ".desktop-titlebar-branch-button");

    expect(titlebarContextSource).toContain("<GitBranch size={13}");
    expect(titlebarContextSource).not.toContain("desktop-titlebar-context-divider");
    expect(titlebarContextSource).not.toContain("VersionControlIcon");
    expect(workspaceSwitcherSource).toContain("{compact && (");
    expect(context).toContain("gap: 0;");
    expect(projectName).toContain("color: var(--desktop-titlebar-text-muted);");
    expect(branchButton).toContain("color: var(--desktop-titlebar-text-muted);");
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
