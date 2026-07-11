import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const markdownEditorCss = readFileSync(
  new URL("../vendor/shared-ui/src/styles/editor/markdown-editor.css", import.meta.url),
  "utf8",
).replaceAll("\r\n", "\n");
const markdownTableCss = readFileSync(
  new URL("../vendor/shared-ui/src/styles/editor/markdown-table-widget.css", import.meta.url),
  "utf8",
).replaceAll("\r\n", "\n");
const markdownHtmlCss = readFileSync(
  new URL("../vendor/shared-ui/src/styles/editor/markdown-html-widget.css", import.meta.url),
  "utf8",
).replaceAll("\r\n", "\n");
const markdownCodeCss = readFileSync(
  new URL("../vendor/shared-ui/src/styles/editor/markdown-code-widgets.css", import.meta.url),
  "utf8",
).replaceAll("\r\n", "\n");

describe("Markdown editor layout", () => {
  it("keeps vertical document padding fixed while the inline gutter responds to width", () => {
    const editorRule = readCssRule(markdownEditorCss, ".markdown-codemirror-editor");
    const contentRule = readCssRule(markdownEditorCss, ".markdown-codemirror-editor .cm-content");

    expect(editorRule).toContain("--po-markdown-editor-gutter-min: 64px;");
    expect(editorRule).toContain("--po-markdown-editor-content-padding-block: 64px;");
    expect(contentRule).toContain("--po-markdown-editor-content-gutter-inline: max(");
    expect(contentRule).toContain("padding-block: var(--po-markdown-editor-content-padding-block);");
    expect(contentRule).toContain("padding-inline: var(--po-markdown-editor-content-gutter-inline);");
    expect(contentRule).not.toMatch(/padding-(?:block|top):[^;]*content-gutter-inline/);
  });

  it("keeps the table breakout reserve separate from the document edge inset", () => {
    const editorRule = readCssRule(markdownEditorCss, ".markdown-codemirror-editor");

    expect(editorRule).toContain("--po-markdown-breakout-right-gutter: 48px;");
  });
});

describe("Markdown rich-block boundary affordance", () => {
  const richWidgetSelector = ".markdown-codemirror-editor :is(.cm-md-code-widget, .cm-md-mermaid-widget, .cm-md-html-widget, .cm-md-image-widget)";
  const richSurfaceSelector = ".markdown-codemirror-editor :is(.cm-md-code-panel, .cm-md-mermaid-body, .cm-md-html-widget-content, .cm-md-image-widget)";

  it("paints state on the inner surface so wrapper spacing stays outside the ring", () => {
    const editorRule = readCssRule(markdownEditorCss, ".markdown-codemirror-editor");
    const wrapperRule = readCssRule(markdownEditorCss, richWidgetSelector);
    const surfaceRule = readCssRule(markdownEditorCss, richSurfaceSelector);
    const hoverRule = readCssRule(
      markdownEditorCss,
      `${richWidgetSelector}:is(:hover, :focus-within):not(.is-doc-selected)`,
    );
    const selectedRule = readCssRule(
      markdownEditorCss,
      `${richWidgetSelector}.is-doc-selected`,
    );

    expect(editorRule).toContain("--cm-md-block-hover-ring:");
    expect(editorRule).toContain("--cm-md-block-selected-ring:");
    expect(wrapperRule).toContain("--cm-md-block-current-ring: transparent;");
    expect(wrapperRule).not.toContain("box-shadow:");
    expect(surfaceRule).toContain("box-shadow: 0 0 0 2px var(--cm-md-block-current-ring);");
    expect(surfaceRule).toContain("transition: box-shadow 140ms ease;");
    expect(hoverRule).toContain("--cm-md-block-current-ring: var(--cm-md-block-hover-ring);");
    expect(selectedRule).toContain("--cm-md-block-current-ring: var(--cm-md-block-selected-ring);");
    expect(surfaceRule).not.toMatch(/\bborder\s*:/);
  });

  it("draws table affordance on its existing frame rather than a second wrapper", () => {
    const hoverSelector = [
      ".markdown-codemirror-editor .cm-md-table-widget-wrap:hover:not(.is-doc-selected) .cm-md-table-widget,",
      ".markdown-codemirror-editor .cm-md-table-widget-wrap:focus-within:not(.is-doc-selected) .cm-md-table-widget",
    ].join("\n");
    const hoverRule = readCssRule(markdownTableCss, hoverSelector);

    expect(markdownTableCss).toContain(
      ".cm-md-table-widget-wrap:focus-within:not(.is-doc-selected) .cm-md-table-widget",
    );
    expect(hoverRule).toContain("box-shadow: 0 0 0 2px var(--cm-md-block-hover-ring);");
    expect(hoverRule).not.toContain("border-color:");
    expect(markdownTableCss).toContain("box-shadow: 0 0 0 2px var(--cm-md-block-selected-ring);");
  });

  it("keeps vertical scrolling at the document level for code blocks", () => {
    const textareaRule = readCssRule(
      markdownCodeCss,
      ".markdown-codemirror-editor .cm-md-code-textarea",
    );

    expect(textareaRule).toContain("box-sizing: border-box;");
    expect(textareaRule).toContain("field-sizing: content;");
    expect(textareaRule).toContain("overflow-x: auto;");
    expect(textareaRule).toContain("overflow-y: hidden;");
  });

  it("lays out code source metadata separately from the language field", () => {
    const headerRule = readCssRule(
      markdownCodeCss,
      ".markdown-codemirror-editor .cm-md-code-header",
    );
    const referenceRule = readCssRule(
      markdownCodeCss,
      ".markdown-codemirror-editor .cm-md-code-source-reference",
    );
    const languageRule = readCssRule(
      markdownCodeCss,
      ".markdown-codemirror-editor .cm-md-code-header.has-source-reference .cm-md-code-language",
    );

    expect(headerRule).toContain("display: flex;");
    expect(referenceRule).toContain("text-overflow: ellipsis;");
    expect(referenceRule).toContain("white-space: nowrap;");
    expect(languageRule).toContain("text-align: right;");
  });

  it("reveals the HTML source control only for hover, keyboard focus, or selection", () => {
    const toolbarRule = readCssRule(
      markdownHtmlCss,
      ".markdown-codemirror-editor .cm-md-html-widget-toolbar",
    );
    const revealRule = readCssRule(
      markdownHtmlCss,
      ".markdown-codemirror-editor .cm-md-html-widget:is(:hover, :focus-within, .is-doc-selected) .cm-md-html-widget-toolbar",
    );

    expect(toolbarRule).toContain("opacity: 0;");
    expect(toolbarRule).toContain("pointer-events: none;");
    expect(toolbarRule).toContain("transition: opacity 140ms ease, transform 140ms ease;");
    expect(revealRule).toContain("opacity: 1;");
    expect(revealRule).toContain("pointer-events: auto;");
  });
});

describe("Markdown table affordance layout", () => {
  it("joins structure-button hit targets to the table while preserving the compact visual bars", () => {
    const frameRule = readCssRule(markdownTableCss, ".markdown-codemirror-editor .cm-md-table-frame");
    const addRowRule = readCssRule(markdownTableCss, ".markdown-codemirror-editor .cm-md-table-add-row");
    const addRowVisualRule = readCssRule(
      markdownTableCss,
      ".markdown-codemirror-editor .cm-md-table-add-row .cm-md-table-structure-button-visual",
    );
    const addColumnRule = readCssRule(markdownTableCss, ".markdown-codemirror-editor .cm-md-table-add-column");
    const addColumnVisualRule = readCssRule(
      markdownTableCss,
      ".markdown-codemirror-editor .cm-md-table-add-column .cm-md-table-structure-button-visual",
    );

    expect(frameRule).toContain("--cm-md-table-action-gutter: 18px;");
    expect(addRowRule).toContain("height: var(--cm-md-table-action-gutter);");
    expect(addRowRule).toContain("bottom: calc(-1 * var(--cm-md-table-action-gutter));");
    expect(addRowVisualRule).toContain("height: 13px;");
    expect(addColumnRule).toContain("width: var(--cm-md-table-action-gutter);");
    expect(addColumnRule).toContain("right: calc(-1 * var(--cm-md-table-action-gutter));");
    expect(addColumnVisualRule).toContain("width: 13px;");
  });

  it("keeps compact drag grips inside larger pointer targets", () => {
    const columnHandleRule = readCssRule(
      markdownTableCss,
      ".markdown-codemirror-editor .cm-md-table-column-handle",
    );
    const columnVisualRule = readCssRule(
      markdownTableCss,
      ".markdown-codemirror-editor .cm-md-table-column-handle .cm-md-table-drag-handle-visual",
    );
    const rowHandleRule = readCssRule(
      markdownTableCss,
      ".markdown-codemirror-editor .cm-md-table-row-handle",
    );
    const rowVisualRule = readCssRule(
      markdownTableCss,
      ".markdown-codemirror-editor .cm-md-table-row-handle .cm-md-table-drag-handle-visual",
    );

    expect(columnHandleRule).toContain("width: 32px;");
    expect(columnHandleRule).toContain("height: 24px;");
    expect(columnVisualRule).toContain("width: 26px;");
    expect(columnVisualRule).toContain("height: 13px;");
    expect(rowHandleRule).toContain("width: 24px;");
    expect(rowHandleRule).toContain("height: 32px;");
    expect(rowVisualRule).toContain("width: 13px;");
    expect(rowVisualRule).toContain("height: 26px;");
  });
});

function readCssRule(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Missing CSS rule for ${selector}`);
  const bodyStart = start + selector.length + 2;
  const end = css.indexOf("\n}", bodyStart);
  if (end < 0) throw new Error(`Unclosed CSS rule for ${selector}`);
  return css.slice(bodyStart, end);
}
