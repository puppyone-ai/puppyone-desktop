import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const surfaceSource = readFileSync(
  new URL("../src/features/app-shell/DesktopDataWorkspaceSurface.tsx", import.meta.url),
  "utf8",
);
const splitSource = readFileSync(
  new URL("../src/features/editor-workbench/layout/DesktopEditorSplitView.tsx", import.meta.url),
  "utf8",
);
const resizeSource = readFileSync(
  new URL("../src/features/editor-workbench/layout/EditorSplitResizeHandle.tsx", import.meta.url),
  "utf8",
);
const paneMoveSource = readFileSync(
  new URL("../src/features/editor-workbench/drag-and-drop/usePaneMoveDrag.ts", import.meta.url),
  "utf8",
);
const fileDropSource = readFileSync(
  new URL("../src/features/editor-workbench/drag-and-drop/useExplorerFileDrop.ts", import.meta.url),
  "utf8",
);
const dropGeometrySource = readFileSync(
  new URL("../src/features/editor-workbench/drag-and-drop/paneDropGeometry.ts", import.meta.url),
  "utf8",
);
const splitStyles = readFileSync(
  new URL("../src/features/editor-workbench/layout/desktop-editor-split-view.css", import.meta.url),
  "utf8",
);
const dataShellStyles = readFileSync(
  new URL("../src/features/data-workspace/data-shell.css", import.meta.url),
  "utf8",
);
const headerStyles = readFileSync(
  new URL("../src/features/app-shell/header-editor-columns.css", import.meta.url),
  "utf8",
);

describe("editor split-pane architecture", () => {
  it("keeps file selection out of the Header", () => {
    expect(appSource).not.toContain("DesktopEditorTabs");
    expect(appSource).not.toContain("titlebarEditorSlot");
    expect(appSource).toContain("contextSlot={(\n          titlebarSidebarSlot\n        )}");
  });

  it("projects the pane tree inside the Data editor region", () => {
    expect(surfaceSource).toContain('mainSlot={resolvedSurface.id === "data"');
    expect(surfaceSource).toContain("<DesktopEditorSplitView");
    expect(surfaceSource).toContain("layout={editorWorkbench.paneLayout}");
    expect(surfaceSource).toContain('loadActiveFileSource={resolvedSurface.id !== "data"}');
    expect(splitSource).toContain('data-direction={split.direction}');
    expect(resizeSource).toContain('role="separator"');
    expect(splitSource).toContain('className="desktop-editor-pane-handle"');
    expect(splitSource).toContain("onOpenAtPaneEdge");
    expect(splitSource).toContain("onMovePane");
    expect(splitSource).not.toContain("onSplitPane");
    expect(splitSource).toContain('className="desktop-editor-drop-preview"');
    expect(dropGeometrySource).toContain("closestPaneDropEdge");
    expect(fileDropSource).toContain("parseExplorerReferenceDrag");
    expect(fileDropSource).toContain("onOpenAtPaneEdge");
    expect(paneMoveSource).toContain("onMovePane");
  });

  it("fills the editor region and uses overlay handles with dedicated resize lanes", () => {
    expect(splitStyles).toContain("--desktop-editor-divider-size: var(--po-pane-resizer-line-size, 1px);");
    expect(splitStyles).toContain("--desktop-editor-resize-hit-size: var(--po-pane-resizer-hit-size, 8px);");
    expect(splitSource).toContain("var(--desktop-editor-divider-size)");
    expect(splitStyles).toContain(".desktop-editor-splitter::before");
    expect(resizeSource).toContain("const dividerSize");
    expect(splitStyles).toContain("flex: 1 1 0;");
    expect(splitStyles).toContain(".desktop-editor-pane-handle-shell");
    expect(splitStyles).toContain(".desktop-editor-drop-preview");
    expect(splitStyles).not.toContain(".desktop-editor-pane-bar");
    expect(splitStyles).not.toContain("border-radius: 7px 7px 0 0");
    expect(splitStyles).not.toContain("tablist");
  });

  it("joins root split dividers to the Editor-facing edge of the Sidebar gutter", () => {
    expect(dataShellStyles).toMatch(
      /\.data-explorer-resizer::after\s*\{[^}]*inset-inline-start:\s*auto;[^}]*inset-inline-end:\s*0;/s,
    );
    expect(dataShellStyles).toMatch(
      /\.data-content\[data-resizable-explorer="true"\]\s*>\s*\.explorer-column\s*\{[^}]*border-inline-end-color:\s*transparent;/s,
    );
    expect(dataShellStyles).toMatch(
      /\.data-explorer-resizer\s*\{[^}]*background:\s*var\(--po-sidebar\);/s,
    );
  });

  it("does not project the Sidebar divider through the Header", () => {
    expect(headerStyles).not.toContain(".desktop-titlebar::before");
    expect(headerStyles).not.toContain("--desktop-titlebar-sidebar-width) - 1px");
  });
});
