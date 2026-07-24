import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const csvEditorSource = readFileSync(
  new URL("../packages/shared-ui/src/editor/CsvTableEditor.tsx", import.meta.url),
  "utf8",
);
const csvControlsSource = readFileSync(
  new URL("../packages/shared-ui/src/editor/csv/CsvTableControls.tsx", import.meta.url),
  "utf8",
);
const csvMenuSource = readFileSync(
  new URL("../packages/shared-ui/src/editor/csv/CsvTableMenu.tsx", import.meta.url),
  "utf8",
);
const csvSettingsSource = readFileSync(
  new URL("../packages/shared-ui/src/editor/csv/CsvTableSettings.tsx", import.meta.url),
  "utf8",
);
const csvResizeSource = readFileSync(
  new URL("../packages/shared-ui/src/editor/csv/CsvTableResizeControl.tsx", import.meta.url),
  "utf8",
);
const editorEntryCss = readFileSync(
  new URL("../packages/shared-ui/src/styles/editor.css", import.meta.url),
  "utf8",
);
const sharedTableCss = readFileSync(
  new URL("../packages/shared-ui/src/styles/editor/editable-table.css", import.meta.url),
  "utf8",
);
const csvTableCss = readFileSync(
  new URL("../packages/shared-ui/src/styles/editor/csv-table-editor.css", import.meta.url),
  "utf8",
);
const markdownTableCss = readFileSync(
  new URL("../packages/shared-ui/src/styles/editor/markdown-table-widget.css", import.meta.url),
  "utf8",
);

describe("CSV table visual architecture", () => {
  it("keeps CSV semantic while sharing the Markdown table language", () => {
    expect(csvEditorSource).toContain("<table");
    expect(csvEditorSource).toContain("<thead>");
    expect(csvEditorSource).toContain("<tbody>");
    expect(csvEditorSource).toContain('scope="col"');
    expect(csvEditorSource).toContain('scope="row"');
    expect(csvEditorSource).toContain("data-csv-row");
    expect(csvEditorSource).toContain("data-csv-record-index");
    expect(csvEditorSource).not.toContain("gridTemplateColumns");

    expect(editorEntryCss.indexOf('editor/editable-table.css')).toBeLessThan(
      editorEntryCss.indexOf('editor/csv-table-editor.css'),
    );
    expect(editorEntryCss.indexOf('editor/editable-table.css')).toBeLessThan(
      editorEntryCss.indexOf('editor/markdown-table-widget.css'),
    );

    for (const token of [
      "--po-editable-table-border",
      "--po-editable-table-cell-border",
      "--po-editable-table-cell-padding",
      "--po-editable-table-cell-focus-ring",
      "--po-editable-table-row-min-height",
      "--po-editable-table-header-font-weight",
    ]) {
      expect(sharedTableCss).toContain(token);
      expect(csvTableCss).toContain(token);
      expect(markdownTableCss).toContain(token);
    }
    expect(sharedTableCss).toContain("--po-editable-table-structure-hover-background");
  });

  it("combines Markdown-style chrome with a CSV-specific record gutter and sticky semantic header", () => {
    expect(csvTableCss).not.toContain(".csv-table-editor__toolbar");
    expect(csvTableCss).toMatch(/\.csv-table-editor\s*\{[^}]*width:\s*100%[^}]*height:\s*100%/s);
    expect(csvTableCss).toContain(".csv-table-editor__record-index");
    expect(csvTableCss).toContain("position: sticky");
    expect(csvTableCss).toContain("--csv-table-record-index-width: var(--po-editable-table-row-min-height)");
    expect(csvTableCss).toMatch(/\.csv-table-editor__record-index-label\s*\{[^}]*min-height:\s*calc\(var\(--po-editable-table-row-min-height\) - 1px\)[^}]*justify-content:\s*center[^}]*padding:\s*0/s);
    expect(csvTableCss).toMatch(/\.csv-table-editor__table th,[\s\S]*?\.csv-table-editor__table td\s*\{[^}]*box-sizing:\s*border-box[^}]*height:\s*var\(--po-editable-table-row-min-height\)/s);
    expect(csvTableCss).toContain("font-size: inherit");
    expect(csvTableCss).not.toContain("font-size: 10.5px");
    expect(csvTableCss).toContain(".csv-table-editor__table td:focus-within");
    expect(csvSettingsSource).toContain("csv-table-editor__settings-button");
    expect(csvSettingsSource).toContain("editor.csv.headerDescription");
    expect(csvSettingsSource).not.toContain("showRowIndex");
    expect(csvEditorSource).toContain("csv-table-editor__add-row");
    expect(csvEditorSource).toContain("csv-table-editor__add-column");
    expect(csvEditorSource).toContain("CsvTableResizeControl");
    expect(csvEditorSource).toContain("columnWidths={columnWidths}");
    expect(csvResizeSource).toContain("csv-table-editor__resize-preview");
    expect(csvResizeSource).toContain("getCsvTableResizePreviewGeometry");
    expect(csvResizeSource).toContain("getCsvTableResizeViewportConstraints");
    expect(csvResizeSource).toContain("csv-table-editor__resize-preview-track--record-index");
    expect(csvResizeSource).toContain("csv-table-editor__resize-preview-cell--record-index");
    expect(csvResizeSource).toContain("currentDataRowCount + previewRowIndex + 1");
    expect(csvResizeSource).toContain(
      "csv-table-editor__resize-handle-visual po-editable-table-structure-button-visual",
    );
    expect(csvResizeSource).toContain('role="grid"');
    expect(csvResizeSource).toContain("Math.max(0, horizontalDistance)");
    expect(csvTableCss).not.toContain(".csv-table-editor__surface::after");
    expect(csvTableCss).toMatch(
      /\.csv-table-editor__table\s*\{[^}]*border:\s*1px solid var\(--po-editable-table-border\)[^}]*border-radius:\s*var\(--po-editable-table-radius\)/s,
    );
    expect(csvTableCss).not.toMatch(
      /\.csv-table-editor__table \.csv-table-editor__record-index\s*\{[^}]*border-inline-end:\s*0/s,
    );
    expect(csvTableCss).toContain(
      ".csv-table-editor__table > thead > tr:first-child > :first-child",
    );
    expect(csvTableCss).toMatch(
      /\.csv-table-editor__resize-preview\s*\{[^}]*box-sizing:\s*border-box[^}]*inline-size:\s*calc\(100% \+ var\(--csv-table-resize-added-width\)\)[^}]*block-size:\s*calc\(100% \+ var\(--csv-table-resize-added-height\)\)[^}]*border:\s*1px solid var\(--csv-table-resize-preview-border\)/s,
    );
    expect(csvTableCss).not.toContain(".csv-table-editor__resize-preview::after");
    expect(csvTableCss.match(
      /border:\s*1px solid var\(--csv-table-resize-preview-border\)/g,
    )).toHaveLength(1);
    expect(csvTableCss).not.toContain(".csv-table-editor__resize-preview-columns::after");
    expect(csvTableCss).not.toContain(".csv-table-editor__resize-preview-rows::after");
    expect(csvTableCss).toMatch(
      /\.csv-table-editor__resize-preview-columns::before\s*\{[^}]*inset-inline-start:\s*0[^}]*inline-size:\s*1px/s,
    );
    expect(csvTableCss).toMatch(
      /\.csv-table-editor__resize-preview-rows::before\s*\{[^}]*inset-block-start:\s*0[^}]*block-size:\s*1px/s,
    );
    expect(csvTableCss).toContain("border-inline-end-color: transparent");
    expect(csvTableCss).toContain("border-block-end-color: transparent");
    expect(csvTableCss).toMatch(
      /\.csv-table-editor__surface:has\(\.csv-table-editor__resize-preview-columns\)[\s\S]*?border-start-end-radius:\s*0/s,
    );
    expect(csvTableCss).toMatch(
      /\.csv-table-editor__surface:has\(\.csv-table-editor__resize-preview-rows\)[\s\S]*?border-end-start-radius:\s*0/s,
    );
    expect(csvTableCss).toMatch(
      /\.csv-table-editor__resize-preview-track--record-index\s*\{[^}]*border-inline-end:\s*1px solid var\(--csv-table-resize-preview-grid\)/s,
    );
    expect(csvTableCss).toContain("--csv-table-resize-preview-data-background");
    expect(csvTableCss).toContain("border: 1px solid var(--csv-table-resize-preview-border)");
    expect(csvTableCss).not.toContain("border: 1px dashed");
    expect(csvTableCss).toMatch(
      /\.csv-table-editor__resize-preview-cell--record-index\s*\{[^}]*justify-content:\s*center[^}]*font-variant-numeric:\s*tabular-nums/s,
    );
    expect(csvTableCss).toMatch(
      /\.csv-table-editor__resize-handle-visual\s*\{[^}]*width:\s*13px[^}]*height:\s*13px/s,
    );
    expect(csvTableCss).toMatch(
      /\.csv-table-editor__resize-handle:hover \.csv-table-editor__resize-handle-visual,[\s\S]*?border-color:\s*var\(--po-editable-table-structure-hover-border\)[^}]*background:\s*var\(--po-editable-table-structure-hover-background\)[^}]*color:\s*var\(--po-editable-table-structure-hover-color\)/s,
    );
    expect(csvTableCss).not.toContain("border-inline-end: 1.5px solid currentColor");
    expect(csvTableCss).toMatch(
      /\.csv-table-editor__resize-preview-columns\s*\{[^}]*inset-inline-start:\s*calc\(100% - var\(--csv-table-resize-added-width\)\)[^}]*block-size:\s*calc\(100% - var\(--csv-table-resize-added-height\)\)/s,
    );
    expect(csvTableCss).toMatch(
      /\.csv-table-editor__resize-preview-rows\s*\{[^}]*inset-block-start:\s*calc\(100% - var\(--csv-table-resize-added-height\)\)[^}]*inline-size:\s*100%/s,
    );
    expect(csvTableCss).toMatch(
      /\.csv-table-editor__resize-preview-columns[\s\S]*?> \.csv-table-editor__resize-preview-track::before\s*\{[^}]*inset-block-start:\s*var\(--csv-table-resize-row-height\)[^}]*background-size:\s*100% var\(--csv-table-resize-row-height\)/s,
    );
    expect(csvTableCss).not.toContain("grid-template-columns: repeat(6, 16px)");
    expect(csvTableCss).not.toContain("var(--csv-table-resize-column-width)");
    expect(csvControlsSource).toContain("po-editable-table-row-handle");
    expect(csvControlsSource).toContain('direction === "rtl" ? rect.left : rect.right');
    expect(csvTableCss).not.toContain("is-row-control-active");
    expect(csvControlsSource).toContain("po-editable-table-column-handle");
    expect(csvControlsSource).toContain("getEditableTableDropBoundary");
    expect(csvMenuSource).toContain("po-editable-table-context-menu");
    expect(csvMenuSource).toContain('role="menuitem"');
    expect(markdownTableCss).toContain("po-editable-table");
  });
});
