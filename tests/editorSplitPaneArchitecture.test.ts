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
const workbenchControllerSource = readFileSync(
  new URL("../src/features/editor-workbench/controller/useDesktopEditorWorkbench.ts", import.meta.url),
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
const paneChromeSource = readFileSync(
  new URL("../src/features/editor-workbench/layout/EditorPaneChrome.tsx", import.meta.url),
  "utf8",
);
const paneActionsMenuSource = readFileSync(
  new URL("../src/features/editor-workbench/layout/EditorPaneActionsMenu.tsx", import.meta.url),
  "utf8",
);
const paneChromeRevealSource = readFileSync(
  new URL("../src/features/editor-workbench/layout/useEditorPaneChromeReveal.ts", import.meta.url),
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
const paneMovePreviewSource = readFileSync(
  new URL("../src/features/editor-workbench/drag-and-drop/paneMovePreview.ts", import.meta.url),
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
    expect(paneChromeSource).toContain('className="desktop-editor-pane-handle"');
    expect(paneShellSource).not.toContain("paneCount > 1 &&");
    expect(splitSource).toContain("onOpenAtPaneEdge");
    expect(splitSource).toContain("onMovePane");
    expect(splitSource).toContain("onSplitPane");
    expect(paneActionsMenuSource).toContain('t("editor.panes.splitLeft")');
    expect(paneActionsMenuSource).toContain('t("editor.panes.splitRight")');
    expect(paneActionsMenuSource).toContain('t("editor.panes.splitUp")');
    expect(paneActionsMenuSource).toContain('t("editor.panes.splitDown")');
    expect(workbenchControllerSource).toContain("const splitPane = useCallback");
    expect(workbenchControllerSource).toContain("editorId: null");
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
    expect(splitStyles).toContain(".desktop-editor-pane[data-handle-hot]");
    const handleShellRule = readCssBlock(splitStyles, ".desktop-editor-pane-handle-shell");
    expect(handleShellRule).toContain("pointer-events: none;");
    expect(splitStyles).toContain("pointer-events: auto;");
    expect(splitStyles).toContain(".desktop-editor-drop-preview");
    expect(splitStyles).toContain(".desktop-editor-pane-move-preview");
    expect(splitStyles).toContain(".desktop-editor-pane[data-move-source]");
    const movePreviewRule = readCssBlock(splitStyles, ".desktop-editor-pane-move-preview");
    expect(movePreviewRule).toContain("border: 0;");
    expect(movePreviewRule).toContain("border-radius: 2px;");
    expect(movePreviewRule).not.toContain("0 18px 40px");
    const handleRule = readCssBlock(splitStyles, ".desktop-editor-pane-handle");
    expect(handleRule).toContain("border: 0;");
    expect(handleRule).toContain("background: transparent;");
    expect(handleRule).toContain("var(--po-text-muted) 68%");
    expect(handleRule).toContain("gap: 2px;");
    expect(handleRule).not.toContain("box-shadow:");
    expect(handleRule).not.toContain("border-radius:");
    const handleDotRule = readCssBlock(splitStyles, ".desktop-editor-pane-handle > i");
    expect(handleDotRule).toContain("width: 2px;");
    expect(handleDotRule).toContain("height: 2px;");
    expect(handleDotRule).toContain("border-radius: 0;");
    expect(handleDotRule).toContain("background: currentColor;");
    const menuPrimaryActionRule = readCssBlock(
      splitStyles,
      ".desktop-editor-pane-menu-primary-action.desktop-menu-icon-button",
    );
    expect(menuPrimaryActionRule).toContain("width: var(--desktop-editor-pane-menu-action-size);");
    expect(menuPrimaryActionRule).toContain("height: var(--desktop-editor-pane-menu-action-size);");
    expect(menuPrimaryActionRule).toContain("border-radius: var(--desktop-toolbar-action-radius);");
    const paneMenuRule = readCssBlock(splitStyles, ".desktop-editor-pane-menu");
    expect(paneMenuRule).toContain(
      "--desktop-editor-pane-menu-action-size: var(--desktop-titlebar-control-height);",
    );
    expect(paneMenuRule).toContain("position: fixed;");
    expect(paneMenuRule).toContain("overflow-y: auto;");
    expect(splitStyles).not.toContain('.desktop-editor-pane-menu[data-has-secondary="true"]');
    const closeActionRule = readCssBlock(
      splitStyles,
      ".desktop-editor-pane-menu-close-action.desktop-menu-icon-button",
    );
    expect(closeActionRule).toContain("color: var(--po-danger);");
    const endActionsRule = readCssBlock(
      splitStyles,
      ".desktop-editor-pane-menu-end-actions",
    );
    expect(endActionsRule).toContain("display: flex;");
    expect(endActionsRule).toContain("margin-inline-start: auto;");
    const externalDividerRule = readCssBlock(
      splitStyles,
      ".desktop-editor-pane-menu-action-divider",
    );
    expect(externalDividerRule).toContain(
      "width: var(--desktop-editor-pane-menu-action-size);",
    );
    expect(externalDividerRule).toContain(
      "height: var(--desktop-editor-pane-menu-action-size);",
    );
    expect(externalDividerRule).toContain("pointer-events: none;");
    const externalDividerLineRule = readCssBlock(
      splitStyles,
      ".desktop-editor-pane-menu-action-divider::before",
    );
    expect(externalDividerLineRule).toContain("width: 1px;");
    expect(externalDividerLineRule).toContain("height: 12px;");
    expect(externalDividerLineRule).toContain("background: var(--po-divider);");
    expect(paneActionsMenuSource).toContain(
      'className="desktop-editor-pane-menu-primary-action desktop-editor-pane-menu-close-action"',
    );
    const paneHoverOverlayRule = readCssBlock(
      splitStyles,
      '.desktop-editor-split-view:not([data-pane-count="1"]) .desktop-editor-pane::after',
    );
    expect(paneHoverOverlayRule).toContain("position: absolute;");
    expect(paneHoverOverlayRule).toContain("pointer-events: none;");
    expect(paneHoverOverlayRule).toContain("inset: 0;");
    expect(paneHoverOverlayRule).toContain("box-shadow: inset 0 0 0 1px var(--po-divider);");
    expect(paneHoverOverlayRule).toContain("opacity: 0;");
    expect(splitStyles).toContain(
      ".desktop-editor-pane[data-handle-hot]:not([data-move-source])::after",
    );
    expect(splitStyles).not.toContain("@keyframes desktop-editor-pane-activate");
    expect(splitStyles).toContain("var(--po-pane-resizer-active-color)");
    expect(splitStyles).not.toContain(".desktop-editor-pane-bar");
    expect(splitStyles).not.toContain("border-radius: 7px 7px 0 0");
    expect(splitStyles).not.toContain("tablist");
  });

  it("isolates editor focus, overlay, and drag gesture state by scope", () => {
    expect(splitSource).toContain("openActionsPaneId");
    expect(paneShellSource).toContain("onFocusCapture={onActivate}");
    expect(paneShellSource).toContain("<EditorPaneChrome");
    expect(paneShellSource).toContain("useEditorPaneChromeReveal");
    expect(paneChromeRevealSource).toContain("PANE_HANDLE_REVEAL_RATIO = 1 / 3");
    expect(paneShellSource).toContain('data-handle-hot={chromeReveal.revealed ? "true" : undefined}');
    expect(paneShellSource).toContain("onPointerMove={chromeReveal.onPointerMove}");
    expect(paneChromeSource).toContain("onPointerEnter={() =>");
    expect(paneChromeSource).toContain("paneMove.prepare(paneRef.current, pane.id)");
    expect(paneChromeSource).toContain("onPointerUp={(event)");
    expect(paneShellSource).not.toContain("onPointerDownCapture");
    expect(paneChromeSource).not.toContain("consumeDraggedClick");
    expect(paneActionsMenuSource).toContain("<DesktopOverlayLayer>");
    expect(paneActionsMenuSource).toContain("useAnchoredOverlayPosition");
    expect(paneActionsMenuSource).toContain('alignment: "center"');
    expect(splitSource).not.toContain("key={layout.root.id}");
    expect(splitSource).toContain("key={split.first.id}");
    expect(splitSource).toContain("key={split.second.id}");
    expect(splitSource).toContain("key={split.id}");
    expect(splitSource).toContain("createEditorNodeIndex(state.tree)");
    expect(splitSource).toContain("<EditorPaneRuntime");
    expect(paneRuntimeSource).toContain("memo(function EditorPaneRuntime");
    expect(paneRuntimeSource).toContain("<EditorPaneDocumentRuntime");
    expect(paneDocumentRuntimeSource).toContain("memo(function EditorPaneDocumentRuntime");
    expect(paneDocumentRuntimeSource).toContain("useEditorPaneSource(sourceNode");
    expect(paneSourceLifecycle).toContain("new AbortController()");
    expect(paneMoveSource).toContain("createPaneMovePreview");
    expect(paneMoveSource).toContain("destroyPaneMovePreview");
    expect(paneMoveSource).toContain("samePaneDropIntent");
    expect(paneMoveSource).toContain("PREPARED_SNAPSHOT_MAX_AGE_MS = 1_000");
    expect(paneMoveSource).toContain("PANE_MOVE_THRESHOLD_PX = 3");
    expect(paneMoveSource.indexOf("capturePaneMovePreview(sourcePane)"))
      .toBeLessThan(paneMoveSource.indexOf("distance < PANE_MOVE_THRESHOLD_PX"));
    expect(paneMovePreviewSource).toContain("capturePanePreview");
    expect(paneMovePreviewSource).toContain('getElementById("desktop-overlay-root")');
    expect(paneMovePreviewSource).not.toContain("cloneNode");
    expect(paneMovePreviewSource).not.toContain('querySelectorAll("*")');
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
    expect(resizeGestureSource).toContain(
      "session.onCommit(session.splitId, session.previewRatio)",
    );
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

  it("lets Header context grow independently of the Sidebar width", () => {
    const sidebarContext = readCssBlock(headerStyles, ".desktop-titlebar-sidebar-context");
    const expandedContext = readCssBlock(
      headerStyles,
      '.desktop-titlebar-sidebar-context[data-sidebar-state="expanded"]',
    );

    expect(sidebarContext).toContain("--desktop-titlebar-context-max-width: 440px;");
    expect(sidebarContext).toContain("max-width: 100%;");
    expect(sidebarContext).toContain("overflow: hidden;");
    expect(expandedContext).toContain("width: fit-content;");
    expect(expandedContext).toContain(
      "max-width: min(var(--desktop-titlebar-context-max-width), 100%);",
    );
    expect(headerStyles).not.toContain("--desktop-titlebar-sidebar-width");
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

function readCssBlock(css: string, selector: string): string {
  const marker = `${selector} {`;
  const start = css.indexOf(marker);
  if (start < 0) throw new Error(`Missing CSS block for ${selector}`);
  const bodyStart = start + marker.length;
  const end = css.indexOf("\n}", bodyStart);
  if (end < 0) throw new Error(`Unclosed CSS block for ${selector}`);
  return css.slice(bodyStart, end);
}
