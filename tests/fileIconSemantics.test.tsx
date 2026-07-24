import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  FILE_ICON_THEMES,
  FILE_VISUAL_KINDS,
  FileGlyphIcon,
  FilePreviewIcon,
  getFileVisualKind,
  type FileIconThemeId,
} from "../packages/shared-ui/src/file/fileIcons";
import { FILE_ICON_THEME_REGISTRY } from "../packages/shared-ui/src/file/icon-themes/registry";

describe("file icon semantics", () => {
  it.each(["table.csv", "table.tsv", "table.xlsx"])("classifies %s as a spreadsheet", (name) => {
    expect(getFileVisualKind(name)).toBe("spreadsheet");
  });

  it.each(["movie.mp4", "movie.mov", "movie.webm"])(
    "classifies %s as video",
    (name) => {
      expect(getFileVisualKind(name)).toBe("video");
    },
  );

  it.each<FileIconThemeId>(["default", "lines"])(
    "renders compact video files with a player glyph in the %s theme",
    (theme) => {
      const markup = renderToStaticMarkup(
        <FileGlyphIcon name="movie.mp4" size={18} theme={theme} />,
      );

      expect(markup).toContain('data-file-icon-shape="video-player"');
    },
  );

  it.each(FILE_ICON_THEMES)(
    "renders every registered semantic kind in the $id theme",
    ({ id }) => {
      const theme = FILE_ICON_THEME_REGISTRY[id];

      for (const kind of FILE_VISUAL_KINDS) {
        const markup = renderToStaticMarkup(theme.renderGlyph({
          kind,
          name: `fixture.${kind}`,
          type: kind,
          label: kind.toUpperCase(),
          size: 18,
          color: "currentColor",
        }));

        expect(markup, `${id}:${kind}`).not.toBe("");
      }
    },
  );

  it.each<FileIconThemeId>(["default", "lines", "vscode", "material", "minimal"])(
    "renders spreadsheet glyphs as a standalone table grid in the %s theme",
    (theme) => {
      const markup = renderToStaticMarkup(<FileGlyphIcon name="table.csv" size={18} theme={theme} />);

      expect(markup).toContain('data-file-icon-shape="table-grid"');
      expect(markup).toContain('data-file-icon-grid="2x2"');
    },
  );

  it("publishes every built-in theme in deterministic registry order", () => {
    expect(FILE_ICON_THEMES.map(({ id }) => id)).toEqual([
      "default",
      "lines",
      "vscode",
      "material",
      "minimal",
    ]);
  });

  it.each<FileIconThemeId>(["default", "lines", "vscode", "material", "minimal"])(
    "renders folder previews and their child count through the %s theme",
    (theme) => {
      const markup = renderToStaticMarkup(
        <FilePreviewIcon
          name="folder"
          type="folder"
          size={56}
          childrenCount={3}
          theme={theme}
        />,
      );

      expect(markup).toContain("<svg");
      expect(markup).toContain(">3</span>");
    },
  );

  it("keeps the lines folder treatment inherited from the default theme", () => {
    const renderFolder = (theme: FileIconThemeId) => renderToStaticMarkup(
      <FilePreviewIcon name="folder" type="folder" size={56} theme={theme} />,
    );

    expect(renderFolder("lines")).toBe(renderFolder("default"));
  });
});
