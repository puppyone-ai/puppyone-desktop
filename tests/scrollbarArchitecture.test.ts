import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const tokensCss = readCss("src/styles/tokens.css");
const scrollbarsCss = readCss("src/styles/scrollbars.css");
const dataWorkspaceCss = readCss("packages/shared-ui/src/styles/data-workspace.css");
const dataWorkspaceSource = readCss("packages/shared-ui/src/data/DataWorkspace.tsx");
const desktopDataShellCss = readCss("src/features/data-workspace/data-shell.css");
const sidebarPrimitivesCss = readCss("packages/shared-ui/src/styles/sidebar-primitives.css");
const sidebarResizeHandleSource = readCss(
  "packages/shared-ui/src/sidebar/SidebarResizeHandle.tsx",
);
const auxiliaryPanelSource = readCss(
  "src/features/app-shell/auxiliary/AuxiliaryPanelHost.tsx",
);
const gitStatusSource = readCss("src/features/source-control/GitStatusView.tsx");
const historyDetailCss = readCss("src/features/source-control/styles/history-detail.css");
const layoutCss = readCss("src/styles/layout.css");
const baseCss = readCss("src/styles/base.css");
const csvTableCss = readCss("packages/shared-ui/src/styles/editor/csv-table-editor.css");
const markdownEditorCss = readCss("packages/shared-ui/src/styles/editor/markdown-editor.css");
const markdownTableCss = readCss("packages/shared-ui/src/styles/editor/markdown-table-widget.css");

describe("scrollbar architecture", () => {
  it("defines one modern track and thumb geometry", () => {
    expect(tokensCss).toContain("--po-scrollbar-size: 12px;");
    expect(tokensCss).toContain("--po-scrollbar-thumb-size: 6px;");
    expect(tokensCss).toContain("--po-scrollbar-thumb-active-size: 8px;");
    expect(tokensCss).toContain("--po-scrollbar-thumb-inset: 3px;");
    expect(tokensCss).toContain("--po-scrollbar-thumb-active-inset: 2px;");
    expect(tokensCss).toContain("--po-scrollbar-radius: 999px;");
    expect(scrollbarsCss).toContain("width: var(--po-scrollbar-size, 12px);");
    expect(scrollbarsCss).toContain("height: var(--po-scrollbar-size, 12px);");
    expect(scrollbarsCss).toContain(
      "border: var(--po-scrollbar-thumb-inset, 3px) solid transparent;",
    );
    expect(scrollbarsCss).toContain("background-clip: padding-box;");
    expect(scrollbarsCss).toContain(':root[data-interface-style="default"]');
    expect(scrollbarsCss).toContain(":where(:hover, :focus-within, .po-scrollbar-active)");
    expect(scrollbarsCss).toContain(
      "border-width: var(--po-scrollbar-thumb-active-inset, 2px);",
    );
    expect(scrollbarsCss).toMatch(
      /\*::-webkit-scrollbar-thumb\s*\{[^}]*background-color:\s*var\(--po-scrollbar-thumb\);/s,
    );
    expect(scrollbarsCss).toMatch(
      /data-interface-style="default"[^{}]*\*::-webkit-scrollbar-thumb\s*\{[^}]*background-color:\s*transparent;/s,
    );
  });

  it("shares the sidebar presentation color with editor scrollbars", () => {
    expect(tokensCss).toContain("--po-scrollbar-presentation-thumb: color-mix(");
    expect(tokensCss).toContain("--po-scrollbar-presentation-thumb-hover: color-mix(");
    expect(tokensCss).toContain(
      "--desktop-sidebar-scrollbar-thumb: var(--po-scrollbar-presentation-thumb);",
    );
    expect(scrollbarsCss).toContain(
      "background-color: var(--po-scrollbar-presentation-thumb, var(--po-scrollbar-thumb));",
    );
    expect(dataWorkspaceCss).toContain(
      "border: var(--po-scrollbar-thumb-inset, 3px) solid transparent;",
    );
    expect(dataWorkspaceCss).toContain("background-clip: padding-box;");
    expect(dataWorkspaceCss).toContain("background-color: var(--tree-scrollbar-thumb);");
    expect(dataWorkspaceCss).toContain(
      "background-color: var(--tree-scrollbar-thumb-hover);",
    );
  });

  it("defines one collision-safe pane-edge resize lane", () => {
    expect(tokensCss).toContain("--po-pane-resizer-hit-size: 8px;");
    expect(tokensCss).toContain("--po-pane-resizer-line-size: 1px;");
    expect(sidebarResizeHandleSource).toContain(
      'paneEdge && "po-pane-edge-resize-handle"',
    );

    const sharedResizerRule = readRule(
      sidebarPrimitivesCss,
      ".po-pane-edge-resize-handle",
    );
    expect(sharedResizerRule).toContain("inset-block: 0;");
    expect(sharedResizerRule).toContain(
      "width: var(--po-pane-resizer-hit-size, 8px);",
    );
    expect(sharedResizerRule).toContain("transform: none;");
  });

  it("requires every vertical SidebarResizeHandle to opt into the pane-edge contract", () => {
    const verticalHandlePattern =
      /<SidebarResizeHandle\b(?:(?!<SidebarResizeHandle\b)[\s\S])*?orientation="vertical"/g;
    const violations = [
      ...listFiles(path.join(repositoryRoot, "src"), ".tsx"),
      ...listFiles(path.join(repositoryRoot, "packages/shared-ui/src"), ".tsx"),
    ].flatMap((filePath) => {
      const relativePath = path.relative(repositoryRoot, filePath);
      return Array.from(readFileSync(filePath, "utf8").matchAll(verticalHandlePattern))
        .filter((match) => !/\bpaneEdge\b/.test(match[0]))
        .map(() => relativePath);
    });

    expect(violations).toEqual([]);
  });

  it("keeps Data and History pane resizers after their sidebar scroll lanes", () => {
    for (const css of [dataWorkspaceCss, desktopDataShellCss]) {
      const resizerRule = readRule(css, ".data-explorer-resizer");
      expect(resizerRule).toContain(
        "inset-inline-start: var(--data-explorer-width, clamp(282px, 26vw, 360px));",
      );
      expect(resizerRule).not.toContain("transform:");
      expect(resizerRule).not.toContain("inset-inline-end:");
    }

    expect(dataWorkspaceSource.indexOf('className="data-explorer-resizer"')).toBeGreaterThan(
      dataWorkspaceSource.indexOf("</aside>"),
    );
    expect(dataWorkspaceSource).toMatch(
      /className="data-explorer-resizer"\s+paneEdge/,
    );

    const historyResizerRule = readRule(
      historyDetailCss,
      ".desktop-history-panel-tree-resizer",
    );
    expect(historyResizerRule).toContain(
      "inset-inline-start: var(--desktop-history-tree-width, clamp(260px, 28vw, 380px));",
    );
    expect(historyResizerRule).not.toContain("inset-inline-end:");
    expect(historyResizerRule).not.toContain("transform:");
    expect(gitStatusSource).toMatch(
      /<\/aside>\s+<SidebarResizeHandle\s+className="desktop-history-panel-tree-resizer"\s+paneEdge/,
    );
    expect(gitStatusSource).toContain(
      "const treeElement = event.currentTarget.previousElementSibling;",
    );
    expect(baseCss).not.toContain('[dir="rtl"] .data-explorer-resizer');
  });

  it("keeps the auxiliary resizer on the panel side of the Markdown scroll lane", () => {
    expect(markdownEditorCss).toMatch(
      /\.markdown-codemirror-editor \.cm-scroller\s*\{[^}]*overflow:\s*auto;/s,
    );
    expect(auxiliaryPanelSource).toMatch(
      /className="desktop-right-sidebar-resizer"\s+paneEdge/,
    );

    const rightResizerRule = readRule(layoutCss, ".desktop-right-sidebar-resizer");
    expect(rightResizerRule).toContain("inset-inline-start: 0;");
    expect(rightResizerRule).not.toContain("transform:");
    expect(rightResizerRule).not.toContain("inset-inline-end:");
    expect(baseCss).not.toContain('[dir="rtl"] .desktop-right-sidebar-resizer');
  });

  it("keeps CSV and Markdown table scrollbars on the shared geometry", () => {
    for (const css of [csvTableCss, markdownTableCss]) {
      expect(css).toContain("var(--po-scrollbar-size, 12px)");
      expect(css).toContain(
        "border: var(--po-scrollbar-thumb-inset, 3px) solid transparent;",
      );
      expect(css).toContain("border-radius: var(--po-scrollbar-radius, 999px);");
    }
  });

  it("does not opt any app stylesheet back into platform-native scrollbar rendering", () => {
    const violations = [
      ...listCssFiles(path.join(repositoryRoot, "src")),
      ...listCssFiles(path.join(repositoryRoot, "packages/shared-ui/src")),
    ].filter((filePath) => (
      /(?<![-\w])scrollbar-(?:width|color)\s*:/.test(readFileSync(filePath, "utf8"))
    ));

    expect(violations.map((filePath) => path.relative(repositoryRoot, filePath))).toEqual([]);
  });

  it("does not reset modern thumb clipping with the background shorthand", () => {
    const legacySkinFiles = new Set([
      "src/styles/interface-skin-contract.css",
      "src/styles/macos-tiger.css",
      "src/styles/windows-xp.css",
    ]);
    const violations = [
      ...listCssFiles(path.join(repositoryRoot, "src")),
      ...listCssFiles(path.join(repositoryRoot, "packages/shared-ui/src")),
    ].flatMap((filePath) => {
      const relativePath = path.relative(repositoryRoot, filePath);
      if (legacySkinFiles.has(relativePath)) return [];

      const css = readFileSync(filePath, "utf8");
      const thumbRule = /([^{}]*::-webkit-scrollbar-thumb[^{}]*)\{([^{}]*)\}/g;
      return Array.from(css.matchAll(thumbRule))
        .filter((match) => /(?:^|[;\s])background\s*:/.test(match[2] ?? ""))
        .map((match) => `${relativePath}: ${match[1]?.trim()}`);
    });

    expect(violations).toEqual([]);
  });
});

function readCss(relativePath: string): string {
  return readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

function readRule(css: string, selector: string): string {
  const ruleStart = css.indexOf(`${selector} {`);
  expect(ruleStart).toBeGreaterThanOrEqual(0);
  const ruleEnd = css.indexOf("}", ruleStart);
  expect(ruleEnd).toBeGreaterThan(ruleStart);
  return css.slice(ruleStart, ruleEnd + 1);
}

function listCssFiles(directory: string): string[] {
  return listFiles(directory, ".css");
}

function listFiles(directory: string, extension: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(entryPath, extension);
    return entry.isFile() && entry.name.endsWith(extension) ? [entryPath] : [];
  });
}
