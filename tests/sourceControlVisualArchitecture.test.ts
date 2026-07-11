import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getSourceControlPrimaryActionSlot } from "../src/features/source-control/viewModel";

const viewSource = readFileSync(
  new URL("../src/features/source-control/GitStatusView.tsx", import.meta.url),
  "utf8",
);
const textDiffSource = readFileSync(
  new URL("../src/features/source-control/diff/contributions/text-unified/TextUnifiedDiff.tsx", import.meta.url),
  "utf8",
);
const detailCss = readFileSync(
  new URL("../src/features/source-control/styles/history-detail.css", import.meta.url),
  "utf8",
);
const sidebarBaseCss = readFileSync(
  new URL("../src/features/source-control/styles/sidebar-base.css", import.meta.url),
  "utf8",
);
const sidebarResourcesCss = readFileSync(
  new URL("../src/features/source-control/styles/sidebar-resources.css", import.meta.url),
  "utf8",
);
const historyListCss = readFileSync(
  new URL("../src/features/source-control/styles/history-list.css", import.meta.url),
  "utf8",
);
const diffCss = readFileSync(
  new URL("../src/features/source-control/styles/diff-utility.css", import.meta.url),
  "utf8",
);

describe("source-control visual architecture", () => {
  it("uses a dedicated compact context header for working-file detail", () => {
    expect(viewSource).toContain("desktop-working-file-detail-view");
    expect(viewSource).toContain("desktop-working-file-status");
    expect(viewSource).toContain("hideHeader={files.length === 1}");
    expect(viewSource).not.toContain('<span className="desktop-head-badge">{remote ?');

    const title = compact(readCssBlock(
      detailCss,
      ".desktop-working-file-detail-view .desktop-commit-id-row strong",
    ));
    expect(title).toContain("font-size: var(--po-text-size-title, 16px);");
    expect(title).toContain("font-weight: var(--po-text-weight-semibold, 600);");
  });

  it("keeps file actions at toolbar emphasis", () => {
    const actions = compact(readCssBlock(
      detailCss,
      ".desktop-working-file-actions .secondary-action,\n.desktop-working-file-actions .danger-action",
    ));

    expect(actions).toContain("height: var(--git-action-size);");
    expect(actions).toContain("background: transparent;");
    expect(actions).toContain("font-size: var(--git-action-font-size);");
    expect(actions).toContain("font-weight: 500;");

    const workingFileDetail = viewSource.slice(
      viewSource.indexOf("function WorkingFileDetail"),
      viewSource.indexOf("function FileDiffBlock"),
    );
    const actionsSource = workingFileDetail.slice(
      workingFileDetail.indexOf('className="desktop-working-file-actions"'),
    );
    const openFileIndex = actionsSource.indexOf("onOpenFile(selection.path)");
    const stageIndex = actionsSource.indexOf("onStagePaths([selection.path])");
    const discardIndex = actionsSource.indexOf("onDiscardPaths([selection.path])");
    expect(openFileIndex).toBeGreaterThan(-1);
    expect(stageIndex).toBeGreaterThan(openFileIndex);
    expect(discardIndex).toBeGreaterThan(stageIndex);
  });

  it("shares one 24px action-size contract across Source Control", () => {
    const contract = compact(readCssBlock(
      sidebarBaseCss,
      ".desktop-git-sidebar,\n.desktop-history-detail-view",
    ));
    const operation = compact(readCssBlock(
      sidebarResourcesCss,
      ".desktop-git-operation-button",
    ));

    expect(contract).toContain("--git-action-size: 24px;");
    expect(contract).toContain("--git-action-padding-inline: 7px;");
    expect(contract).toContain("--git-action-font-size: 12px;");
    expect(operation).toContain("height: var(--git-action-size);");
    expect(operation).toContain("padding: 0 var(--git-action-padding-inline);");
    expect(operation).not.toContain("height: 28px;");
  });

  it("assigns solid emphasis to only the next workflow action", () => {
    const operation = compact(readCssBlock(
      sidebarResourcesCss,
      ".desktop-git-operation-button",
    ));
    const primary = compact(readCssBlock(
      sidebarResourcesCss,
      ".desktop-git-operation-button.is-primary",
    ));
    const select = (overrides: Partial<Parameters<typeof getSourceControlPrimaryActionSlot>[0]> = {}) => (
      getSourceControlPrimaryActionSlot({
        hasStagedAction: false,
        hasSyncAction: false,
        hasCommittedAction: false,
        hasSimpleAction: false,
        ...overrides,
      })
    );

    expect(operation).toContain("background: transparent;");
    expect(primary).toContain("background: var(--desktop-git-primary-bg);");
    expect(primary).toContain("color: var(--desktop-git-primary-fg);");
    expect(select({ hasStagedAction: true, hasSyncAction: true, hasCommittedAction: true })).toBe("staged");
    expect(select({ hasSyncAction: true, hasCommittedAction: true })).toBe("sync");
    expect(select({ hasCommittedAction: true, hasSimpleAction: true })).toBe("committed");
    expect(select({ hasSimpleAction: true })).toBe("simple");
    expect(select()).toBeNull();
  });

  it("keeps diff typography dense and color subordinate to content", () => {
    const surface = compact(readCssBlock(diffCss, ".desktop-file-diff"));
    const lines = compact(readCssBlock(diffCss, ".desktop-diff-line"));
    const added = compact(readCssBlock(diffCss, ".desktop-diff-line.add"));
    const removed = compact(readCssBlock(diffCss, ".desktop-diff-line.remove"));
    const lineNumber = compact(readCssBlock(diffCss, ".desktop-diff-line .line-number"));
    const linePrefix = compact(readCssBlock(diffCss, ".desktop-diff-line .line-prefix"));
    const lineCode = compact(readCssBlock(diffCss, ".desktop-diff-line code"));

    expect(lines).toContain("font-size: 12px;");
    expect(lines).toContain("line-height: 18px;");
    expect(surface).toContain(
      "--desktop-git-diff-code-bg: color-mix(in srgb, var(--po-panel) 62%, var(--po-inset));",
    );
    expect(surface).toContain(
      "--desktop-git-diff-added-bg: color-mix(in srgb, var(--po-success) 7%, var(--desktop-git-diff-code-bg));",
    );
    expect(surface).toContain(
      "--desktop-git-diff-removed-bg: color-mix(in srgb, var(--po-danger) 7%, var(--desktop-git-diff-code-bg));",
    );
    expect(added).toContain("color: var(--desktop-git-diff-added-text);");
    expect(removed).toContain("color: var(--desktop-git-diff-removed-text);");
    expect(lineNumber).toContain("width: 42px;");
    expect(linePrefix).toContain("width: 18px;");
    expect(linePrefix).toContain("font-weight: 650;");
    expect(lineCode).toContain("white-space: pre-wrap;");
    expect(diffCss).not.toContain('[data-diff-markers="color"] .desktop-diff-line .line-prefix');

    const hunkBranch = textDiffSource.slice(
      textDiffSource.indexOf('if (line.kind === "hunk")'),
      textDiffSource.indexOf("const prefix =", textDiffSource.indexOf('if (line.kind === "hunk")')),
    );
    const hunkSeparator = compact(readCssBlock(diffCss, ".desktop-diff-hunk-separator"));
    expect(hunkBranch).toContain('className="desktop-diff-hunk-separator"');
    expect(hunkBranch).not.toContain("line.text");
    expect(hunkSeparator).toContain("height: 7px;");

    const lineView = textDiffSource.slice(textDiffSource.indexOf("function DiffLineView"));
    expect(lineView).toContain('line.kind === "remove" ? line.oldLine : line.newLine ?? line.oldLine');
    expect(lineView.match(/className="line-number"/g)).toHaveLength(1);
    expect(lineView).toContain('className="line-prefix"');
  });

  it("keeps sidebar metadata quieter than primary working-tree content", () => {
    const sidebar = compact(readCssBlock(sidebarBaseCss, ".desktop-git-sidebar"));
    const selectedName = compact(readCssBlock(
      historyListCss,
      ".desktop-git-sidebar .desktop-working-tree-row.active .desktop-working-tree-name",
    ));
    const fileIcon = compact(readCssBlock(
      sidebarResourcesCss,
      ".desktop-working-tree-icon :is(svg, img)",
    ));

    expect(sidebar).toContain("--git-font-main: var(--po-text-size-sidebar, 13px);");
    expect(sidebar).toContain("--git-font-small: var(--po-text-size-meta, 12px);");
    expect(sidebar).toContain("--git-weight-regular: var(--po-text-weight-regular, 400);");
    expect(sidebar).toContain("--git-weight-strong: var(--po-text-weight-medium, 500);");
    expect(selectedName).toContain("font-weight: var(--git-weight-strong);");
    expect(fileIcon).toContain("filter: grayscale(1);");
  });
});

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
