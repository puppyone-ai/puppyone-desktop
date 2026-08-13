import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const surfaceSource = readFileSync(
  new URL("../src/features/app-shell/DesktopDataWorkspaceSurface.tsx", import.meta.url),
  "utf8",
);
const splitSource = readFileSync(
  new URL("../src/features/editor-workbench/DesktopEditorSplitView.tsx", import.meta.url),
  "utf8",
);
const splitStyles = readFileSync(
  new URL("../src/features/editor-workbench/desktop-editor-split-view.css", import.meta.url),
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
    expect(splitSource).toContain('role="separator"');
    expect(splitSource).toContain('className="desktop-editor-pane-handle"');
    expect(splitSource).toContain("closestSplitEdge");
    expect(splitSource).toContain('className="desktop-editor-drop-preview"');
  });

  it("fills the editor region and uses overlay handles with dedicated resize lanes", () => {
    expect(splitStyles).toContain("--desktop-editor-splitter-size: var(--po-pane-resizer-hit-size, 8px);");
    expect(splitStyles).toContain("flex: 1 1 0;");
    expect(splitStyles).toContain(".desktop-editor-pane-handle-shell");
    expect(splitStyles).toContain(".desktop-editor-drop-preview");
    expect(splitStyles).not.toContain(".desktop-editor-pane-bar");
    expect(splitStyles).not.toContain("border-radius: 7px 7px 0 0");
    expect(splitStyles).not.toContain("tablist");
  });

  it("keeps the Header/body divider on the same border-inclusive pixel", () => {
    expect(headerStyles).toContain(
      "inset-inline-start: calc(var(--desktop-titlebar-sidebar-width) - 1px);",
    );
    expect(headerStyles).not.toContain("transition: inset-inline-start");
  });
});
