import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  FileGlyphIcon,
  getFileVisualKind,
  type FileIconThemeId,
} from "../packages/shared-ui/src/file/fileIcons";

describe("file icon semantics", () => {
  it.each(["table.csv", "table.tsv", "table.xlsx"])("classifies %s as a spreadsheet", (name) => {
    expect(getFileVisualKind(name)).toBe("spreadsheet");
  });

  it.each<FileIconThemeId>(["default", "lines", "vscode", "material", "minimal"])(
    "renders spreadsheet glyphs as a standalone table grid in the %s theme",
    (theme) => {
      const markup = renderToStaticMarkup(<FileGlyphIcon name="table.csv" size={18} theme={theme} />);

      expect(markup).toContain('data-file-icon-shape="table-grid"');
      expect(markup).toContain('data-file-icon-grid="2x2"');
    },
  );
});
