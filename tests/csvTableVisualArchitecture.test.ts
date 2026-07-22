import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const csvEditorSource = readFileSync(
  new URL("../packages/shared-ui/src/editor/CsvTableEditor.tsx", import.meta.url),
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
      "--po-editable-table-structure-hover-background",
    ]) {
      expect(sharedTableCss).toContain(token);
      expect(csvTableCss).toContain(token);
      expect(markdownTableCss).toContain(token);
    }
  });

  it("preserves spreadsheet affordances without restoring heavy toolbar buttons", () => {
    expect(csvTableCss).toContain("position: sticky");
    expect(csvTableCss).toContain(".csv-table-editor__surface:hover .csv-table-editor__structure-button");
    expect(csvTableCss).toContain(".csv-table-editor__table td:focus-within");
    expect(csvEditorSource).toContain("csv-table-editor__add-row");
    expect(csvEditorSource).toContain("csv-table-editor__add-column");
    expect(csvEditorSource).not.toContain("csv-table-editor__actions button");
  });
});
