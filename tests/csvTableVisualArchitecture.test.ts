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
const csvHeaderSettingsSource = readFileSync(
  new URL("../packages/shared-ui/src/editor/csv/CsvHeaderSettings.tsx", import.meta.url),
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
    expect(csvTableCss).toContain("--csv-table-scroll-inline-start-padding: 26px");
    expect(csvEditorSource).toContain('toggleAttribute("data-inline-scrolled", inlineScrolled)');
    expect(csvTableCss).toMatch(
      /\.csv-table-editor__scroll\s*\{[^}]*padding-inline:\s*var\(--csv-table-scroll-inline-start-padding\)\s*var\(--csv-table-scroll-inline-end-padding\)/s,
    );
    expect(csvTableCss).toMatch(
      /\.csv-table-editor__table thead th\s*\{[^}]*z-index:\s*3[^}]*var\(--po-editable-table-sticky-header-background\)[^}]*var\(--po-editor-bg\)/s,
    );
    expect(csvTableCss).toMatch(
      /\.csv-table-editor__table \.csv-table-editor__record-index\s*\{[^}]*z-index:\s*2[^}]*inset-inline-start:\s*calc\(-1 \* var\(--csv-table-scroll-inline-start-padding\)\)[^}]*var\(--csv-table-record-index-background\)[^}]*var\(--po-editor-bg\)/s,
    );
    expect(csvTableCss).toMatch(
      /\.csv-table-editor__scroll\[data-inline-scrolled\]\s*\.csv-table-editor__record-index\s*\{[^}]*border-inline-start:\s*1px solid var\(--po-editable-table-border\)/s,
    );
    expect(csvTableCss).toMatch(
      /\.csv-table-editor__table thead \.csv-table-editor__record-index\s*\{[^}]*z-index:\s*4/s,
    );
    expect(csvTableCss).toMatch(/\.csv-table-editor__record-index-label\s*\{[^}]*min-height:\s*calc\(var\(--po-editable-table-row-min-height\) - 1px\)[^}]*justify-content:\s*center[^}]*padding:\s*0/s);
    expect(csvTableCss).toMatch(/\.csv-table-editor__table th,[\s\S]*?\.csv-table-editor__table td\s*\{[^}]*box-sizing:\s*border-box[^}]*height:\s*var\(--po-editable-table-row-min-height\)/s);
    expect(csvTableCss).toContain("font-size: inherit");
    expect(csvTableCss).not.toContain("font-size: 10.5px");
    expect(csvTableCss).toContain(".csv-table-editor__table td:focus-within");
    expect(csvHeaderSettingsSource).toContain("csv-table-editor__settings-button");
    expect(csvHeaderSettingsSource).toContain("csv-table-editor__settings-popover");
    expect(csvHeaderSettingsSource).toContain("csv-table-editor__header-toggle-input");
    expect(csvHeaderSettingsSource).toContain('role="switch"');
    expect(csvHeaderSettingsSource).toContain("editor.csv.headerToggle");
    expect(csvHeaderSettingsSource).not.toContain("editor.csv.headerDescription");
    expect(csvHeaderSettingsSource).not.toContain("showRowIndex");
    expect(csvTableCss).not.toContain(".csv-table-editor__settings-menu");
    expect(csvTableCss).not.toContain(".csv-table-editor__settings-summary");
    expect(csvEditorSource).toContain("csv-table-editor__add-row");
    expect(csvEditorSource).toContain("csv-table-editor__add-column");
    expect(csvEditorSource).toContain("CsvTableResizeControl");
    expect(csvEditorSource).toContain("data-resize-preview={resizePreview");
    expect(csvEditorSource).toContain("csv-table-editor__expansion-column");
    expect(csvEditorSource).toContain("csv-table-editor__expansion-row");
    expect(csvEditorSource).toContain("csv-table-editor__expansion-cell");
    expect(csvEditorSource).toContain("onPreviewChange={setResizePreview}");
    expect(csvEditorSource).toContain("structuralDataRowCount + previewRowIndex + 1");
    expect(csvResizeSource).not.toContain('className="csv-table-editor__resize-preview"');
    expect(csvResizeSource).not.toContain("getCsvTableResizePreviewGeometry");
    expect(csvResizeSource).toContain("getCsvTableResizeViewportConstraints");
    expect(csvResizeSource).toContain("onPreviewChange");
    expect(csvResizeSource).toContain("csv-table-editor__resize-handle-visual");
    expect(csvResizeSource).toContain("ArrowDownRight");
    expect(csvResizeSource).not.toContain(
      "csv-table-editor__resize-handle-visual po-editable-table-structure-button-visual",
    );
    expect(csvResizeSource).toContain('role="grid"');
    expect(csvResizeSource).toContain("RESIZE_DRAG_ACTIVATION_DISTANCE = 8");
    expect(csvResizeSource).toContain("snapOutwardDistanceToTrackCount");
    expect(csvResizeSource).toContain("outwardDistance + normalizedTrackSize / 2");
    expect(csvTableCss).toMatch(
      /\.csv-table-editor__resize-picker\.desktop-menu-surface\s*\{[^}]*inline-size:\s*200px[^}]*max-inline-size:\s*calc\(100vw - 16px\)/s,
    );
    expect(csvTableCss).not.toMatch(
      /\.csv-table-editor__resize-picker\.desktop-menu-surface\s*\{[^}]*width:\s*max-content/s,
    );
    expect(csvTableCss).toMatch(
      /\.csv-table-editor__resize-picker-summary\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) max-content[^}]*font-variant-numeric:\s*tabular-nums/s,
    );
    expect(csvTableCss).toMatch(
      /\.csv-table-editor__resize-picker-grid\s*\{[^}]*width:\s*max-content[^}]*justify-self:\s*start/s,
    );
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
      /\.csv-table-editor__surface\[data-resize-preview\] \.csv-table-editor__table\s*\{[^}]*border-color:\s*var\(--csv-table-resize-preview-border\)[^}]*box-shadow:\s*none/s,
    );
    expect(csvTableCss).toMatch(
      /\.csv-table-editor__table \.csv-table-editor__expansion-cell\s*\{[^}]*border-inline-end-color:\s*var\(--csv-table-resize-preview-grid\)[^}]*border-block-end-color:\s*var\(--csv-table-resize-preview-grid\)[^}]*background:\s*var\(--csv-table-resize-preview-data-background\)/s,
    );
    expect(csvTableCss).toContain(".csv-table-editor__expansion-record-index");
    expect(csvTableCss).toContain("--csv-table-resize-preview-data-background");
    expect(csvTableCss).not.toContain(".csv-table-editor__resize-preview {");
    expect(csvTableCss).not.toContain(".csv-table-editor__resize-preview-columns");
    expect(csvTableCss).not.toContain(".csv-table-editor__resize-preview-rows");
    expect(csvTableCss).not.toContain("background-image: linear-gradient");
    expect(csvTableCss).not.toContain("border-inline-end-color: transparent");
    expect(csvTableCss).not.toContain("border-block-end-color: transparent");
    expect(csvTableCss).not.toContain("border: 1px dashed");
    expect(csvTableCss).toMatch(
      /\.csv-table-editor__resize-handle-visual\s*\{[^}]*width:\s*15px[^}]*height:\s*15px[^}]*border:\s*1px solid transparent[^}]*background:\s*var\(--po-editable-table-structure-background\)[^}]*color:\s*transparent/s,
    );
    expect(csvTableCss).toMatch(
      /\.csv-table-editor__resize-handle:hover \.csv-table-editor__resize-handle-visual,[\s\S]*?border-color:\s*var\(--po-editable-table-structure-hover-border\)[^}]*background:\s*var\(--po-editable-table-structure-hover-background\)[^}]*color:\s*var\(--po-editable-table-structure-hover-color\)/s,
    );
    expect(csvTableCss).not.toContain("box-shadow: -3px -3px 0 currentColor");
    expect(csvTableCss).not.toContain("border-inline-end: 1.5px solid currentColor");
    expect(csvTableCss).not.toContain("grid-template-columns: repeat(6, 16px)");
    expect(csvTableCss).not.toContain("var(--csv-table-resize-column-width)");
    expect(csvControlsSource).toContain("po-editable-table-row-handle");
    expect(csvControlsSource).toContain('direction === "rtl" ? rect.right : rect.left');
    expect(sharedTableCss).toMatch(
      /\.po-editable-table-row-handle \.po-editable-table-drag-handle-visual\s*\{[^}]*width:\s*13px[^}]*height:\s*26px/s,
    );
    expect(csvControlsSource).toContain("ROW_HANDLE_OUTER_REACH_PX = 9");
    expect(csvControlsSource).toContain('setAttribute("data-row-handle-docked", "")');
    expect(csvControlsSource).toContain('classList.toggle("is-inline-docked", docked)');
    expect(csvTableCss).toMatch(
      /\.csv-table-editor__row-handle\.is-inline-docked\s*\{[^}]*transform:\s*translate\(4px,\s*-50%\)/s,
    );
    expect(csvTableCss).toMatch(
      /\.csv-table-editor__surface\[dir="rtl"\][\s\S]*?\.csv-table-editor__row-handle\.is-inline-docked\s*\{[^}]*transform:\s*translate\(calc\(-100% - 4px\),\s*-50%\)/s,
    );
    expect(csvTableCss).toMatch(
      /\.csv-table-editor__record-index\[data-row-handle-docked\][\s\S]*?\.csv-table-editor__record-index-label\s*\{[^}]*opacity:\s*0/s,
    );
    expect(csvTableCss).not.toContain(
      ".csv-table-editor__row-handle .po-editable-table-drag-handle-visual",
    );
    expect(csvTableCss).not.toContain("is-row-control-active");
    expect(csvControlsSource).toContain("po-editable-table-column-handle");
    expect(csvControlsSource).toContain("getEditableTableDropBoundary");
    expect(csvMenuSource).toContain("po-editable-table-context-menu");
    expect(csvMenuSource).toContain('role="menuitem"');
    expect(markdownTableCss).toContain("po-editable-table");
  });
});
