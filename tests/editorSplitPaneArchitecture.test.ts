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
const paneShellSource = readFileSync(
  new URL("../src/features/editor-workbench/layout/EditorPaneShell.tsx", import.meta.url),
  "utf8",
);
const paneRuntimeSource = readFileSync(
  new URL("../src/features/editor-workbench/runtime/EditorPaneRuntime.tsx", import.meta.url),
  "utf8",
);
const paneDocumentRuntimeSource = readFileSync(
  new URL("../src/features/editor-workbench/runtime/EditorPaneDocumentRuntime.tsx", import.meta.url),
  "utf8",
);
const paneSourceLifecycle = readFileSync(
  new URL("../src/features/editor-workbench/runtime/useEditorPaneSource.ts", import.meta.url),
  "utf8",
);
const resizeGestureSource = readFileSync(
  new URL("../src/features/editor-workbench/interactions/useSplitResizeGesture.ts", import.meta.url),
  "utf8",
);
const persistenceSource = readFileSync(
  new URL("../src/features/editor-workbench/persistence/editorWorkbenchPersistence.ts", import.meta.url),
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
const layoutStyles = readFileSync(
  new URL("../src/styles/layout.css", import.meta.url),
  "utf8",
);
const tokens = readFileSync(
  new URL("../src/styles/tokens.css", import.meta.url),
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
    expect(paneShellSource).toContain('className="desktop-editor-pane-handle"');
    expect(splitSource).toContain("onOpenAtPaneEdge");
    expect(splitSource).toContain("onMovePane");
    expect(splitSource).not.toContain("onSplitPane");
    expect(paneShellSource).toContain('className="desktop-editor-drop-preview"');
    expect(dropGeometrySource).toContain("closestPaneDropEdge");
    expect(fileDropSource).toContain("parseExplorerReferenceDrag");
    expect(fileDropSource).toContain("onOpenAtPaneEdge");
    expect(paneMoveSource).toContain("onMovePane");
  });

  it("fills the editor region and uses overlay handles with dedicated resize lanes", () => {
    expect(splitStyles).toContain("--desktop-editor-divider-size: var(--po-pane-resizer-line-size, 1px);");
    expect(splitStyles).toContain("--desktop-editor-resize-hit-size: var(--po-pane-resizer-hit-size, 8px);");
    expect(splitStyles).toContain("var(--desktop-editor-divider-size)");
    expect(splitStyles).toContain(".desktop-editor-splitter::before");
    expect(resizeGestureSource).toContain("const dividerSize");
    expect(splitStyles).toContain("flex: 1 1 0;");
    expect(splitStyles).toContain(".desktop-editor-pane-handle-shell");
    expect(splitStyles).toContain(".desktop-editor-drop-preview");
    expect(splitStyles).not.toContain(".desktop-editor-pane-bar");
    expect(splitStyles).not.toContain("border-radius: 7px 7px 0 0");
    expect(splitStyles).not.toContain("tablist");
  });

  it("isolates editor focus, overlay, and drag gesture state by scope", () => {
    expect(splitSource).toContain("openActionsPaneId");
    expect(paneShellSource).toContain("onFocusCapture={onActivate}");
    expect(paneShellSource).toContain("onPointerUp={(event)");
    expect(paneShellSource).not.toContain("onPointerDownCapture");
    expect(splitSource).toContain("key={split.first.id}");
    expect(splitSource).toContain("key={split.second.id}");
    expect(splitSource).toContain("createEditorNodeIndex(state.tree)");
    expect(splitSource).toContain("<EditorPaneRuntime");
    expect(paneRuntimeSource).toContain("memo(function EditorPaneRuntime");
    expect(paneRuntimeSource).toContain("<EditorPaneDocumentRuntime");
    expect(paneDocumentRuntimeSource).toContain("memo(function EditorPaneDocumentRuntime");
    expect(paneDocumentRuntimeSource).toContain("useEditorPaneSource(sourceNode");
    expect(paneSourceLifecycle).toContain("new AbortController()");
    expect(paneMoveSource.indexOf('distance < PANE_MOVE_THRESHOLD_PX'))
      .toBeLessThan(paneMoveSource.indexOf('classList.add("desktop-editor-pane-dragging")'));
    expect(splitStyles).not.toContain(
      ".desktop-editor-pane-dragging .desktop-editor-pane-handle-shell",
    );
  });

  it("previews split resize outside React and commits durable metadata once", () => {
    expect(splitSource).toContain('"--desktop-editor-first-track"');
    expect(splitSource).toContain('"--desktop-editor-second-track"');
    expect(resizeGestureSource).toContain("requestAnimationFrame");
    expect(resizeGestureSource).toContain('finish("commit")');
    expect(resizeGestureSource).toContain('finish("cancel")');
    expect(resizeGestureSource).toContain("onCommit(splitId, session.previewRatio)");
    expect(resizeSource).toContain("useSplitResizeGesture");
  });

  it("coalesces Workbench metadata persistence behind an explicit flush boundary", () => {
    expect(persistenceSource).toContain("EDITOR_WORKBENCH_PERSISTENCE_DELAY_MS = 200");
    expect(persistenceSource).toContain("class EditorWorkbenchPersistenceScheduler");
    expect(persistenceSource).toContain("schedule(storageKey");
    expect(persistenceSource).toContain("flush(): void");
  });

  it("joins root split dividers to the Editor-facing edge of the Sidebar gutter", () => {
    expect(dataShellStyles).toContain(
      "--desktop-editor-sidebar-gutter-size: var(--po-pane-resizer-hit-size, 8px);",
    );
    expect(splitSource).toContain("touchesInlineStart");
    expect(splitStyles).toContain('data-touches-inline-start="true"');
    expect(splitStyles).toContain(
      "inset-inline-start: calc(-1 * var(--desktop-editor-sidebar-gutter-size, 0px));",
    );
    expect(dataShellStyles).not.toContain("border-inline-end-color: transparent;\n}\n\n.explorer-column");
  });

  it("does not project the Sidebar divider through the Header", () => {
    expect(headerStyles).not.toContain(".desktop-titlebar::before");
    expect(headerStyles).not.toContain("--desktop-titlebar-sidebar-width) - 1px");
  });

  it("shares neutral, hover, and active resize-boundary states across panes", () => {
    expect(tokens).toContain("--po-pane-resizer-blue: light-dark(#3b82f6, #60a5fa);");
    expect(tokens).toContain("--po-pane-resizer-hover-color:");
    expect(tokens).toContain("--po-pane-resizer-active-color:");
    expect(tokens).toContain("--po-pane-resizer-active-ring:");
    expect(tokens).not.toMatch(/--po-pane-resizer-(?:hover-color|active-color|active-ring):[^;]*--po-accent/);
    for (const styles of [dataShellStyles, splitStyles, layoutStyles]) {
      expect(styles).toContain("var(--po-pane-resizer-hover-color)");
      expect(styles).toContain("var(--po-pane-resizer-active-color)");
      expect(styles).toContain("var(--po-pane-resizer-active-ring)");
    }
    expect(layoutStyles).toContain("body.desktop-right-sidebar-resizing");
  });
});
