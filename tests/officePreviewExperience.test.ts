import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const officeViewerSource = readFileSync(
  new URL("../packages/shared-ui/src/editor/viewers/OfficeViewer.tsx", import.meta.url),
  "utf8",
);
const officePreviewCss = readFileSync(
  new URL("../packages/shared-ui/src/styles/editor/media-office-preview.css", import.meta.url),
  "utf8",
);
const wordPreviewSource = readFileSync(
  new URL("../packages/shared-ui/src/editor/viewers/word/WordDocumentPreview.tsx", import.meta.url),
  "utf8",
);
const viewerTypesSource = readFileSync(
  new URL("../packages/shared-ui/src/editor/viewerTypes.ts", import.meta.url),
  "utf8",
);
const viewerArchitecture = readFileSync(
  new URL("../docs/architecture/editor/file-format-viewer-pipeline.md", import.meta.url),
  "utf8",
);

describe("lightweight Office preview experience", () => {
  it("keeps one clearly read-only shell without Agent or Office editing controls", () => {
    expect(officeViewerSource).toContain("office-preview__header");
    expect(officeViewerSource).toContain("editor.office.preview");
    expect(officeViewerSource).toContain("editor.openDefaultApp");
    expect(officeViewerSource).not.toMatch(/Ask Agent|continue editing|继续修改/i);
    expect(officeViewerSource).not.toContain("OfficeEditorViewer");
    expect(viewerArchitecture).toContain("lightweight, read-only surface");
    expect(viewerArchitecture).toContain("plugin marketplace");
  });

  it("renders Word on a stable paper surface with visible zoom and font compatibility", () => {
    expect(officeViewerSource).toContain("office-preview__zoom-controls");
    expect(officeViewerSource).toContain("wordResolvedScale");
    expect(wordPreviewSource).toContain('font-family: "宋体"');
    expect(wordPreviewSource).toContain('local("Songti SC")');
    expect(wordPreviewSource).toContain("await document.fonts?.ready");
    expect(wordPreviewSource).toContain("sanitizeDocxDom(fragment)");
    expect(wordPreviewSource).toContain("resolveWordPreviewScale");
    expect(officePreviewCss).toContain("office-document-preview--docx");
  });

  it("reserves only an explicit host-owned Office editor action", () => {
    expect(viewerTypesSource).toContain("OfficeEditorActionResolver");
    expect(viewerTypesSource).toContain("activate: () => void | Promise<void>");
    expect(officeViewerSource).toContain("officeEditorActions.map");
    expect(officeViewerSource).not.toContain("officeEditing");
  });

  it("presents PowerPoint as a thumbnail rail and one central slide stage", () => {
    expect(officeViewerSource).toContain('renderMode: "slide"');
    expect(officeViewerSource).toContain("renderThumbnailToContainer");
    expect(officeViewerSource).toContain("IntersectionObserver");
    expect(officeViewerSource).toContain("office-pptx-thumbnail-rail");
    expect(officeViewerSource).toContain("office-pptx-stage");
    expect(officeViewerSource).not.toContain('renderMode: "list"');
    expect(officePreviewCss).toMatch(
      /\.office-pptx-workspace\s*\{[^}]*display:\s*flex/s,
    );
    expect(officePreviewCss).toMatch(
      /\.office-pptx-thumbnail-rail\s*\{[^}]*overflow-y:\s*auto/s,
    );
  });

  it("keeps spreadsheet navigation familiar and at the bottom of the viewport", () => {
    const gridIndex = officeViewerSource.indexOf("office-spreadsheet-grid-wrap");
    const notesIndex = officeViewerSource.indexOf("previewNotes.length > 0");
    const tabsIndex = officeViewerSource.lastIndexOf("office-spreadsheet-tabs");

    expect(officeViewerSource).toContain("<thead>");
    expect(officeViewerSource).toContain("spreadsheetColumnLabel");
    expect(gridIndex).toBeGreaterThan(-1);
    expect(notesIndex).toBeGreaterThan(gridIndex);
    expect(tabsIndex).toBeGreaterThan(notesIndex);
    expect(officePreviewCss).toMatch(
      /\.office-spreadsheet-grid__column-header\s*\{[^}]*position:\s*sticky[^}]*top:\s*0/s,
    );
    expect(officePreviewCss).toMatch(
      /\.office-spreadsheet-tabs\s*\{[^}]*border-top:/s,
    );
  });
});
