/** @vitest-environment happy-dom */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_EDITOR_GROUP,
  EXPLORER_REFERENCE_DRAG_TYPE,
  activateEditorPane,
  assignEditorToActivePane,
  createEditorInput,
  createEditorPaneLayout,
  openEditor,
  serializeExplorerReferenceDrag,
  splitEditorPane,
  type DataNode,
  type DataWorkspaceState,
  type EditorGroupState,
  type EditorPaneLayoutState,
} from "@puppyone/shared-ui";
import { DesktopEditorSplitView } from "../src/features/editor-workbench/layout/DesktopEditorSplitView";
import { DocumentSurfaceHost } from "../packages/shared-ui/src/editor/host/DocumentSurfaceHost";
import { withTestLocalization } from "./testLocalization";

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("DesktopEditorSplitView", () => {
  it("has no pane header or grab handle when only one pane exists", () => {
    const container = renderSplitView(EMPTY_EDITOR_GROUP, createEditorPaneLayout());

    expect(container.querySelector('[role="tablist"]')).toBeNull();
    expect(container.querySelector(".desktop-editor-pane-bar")).toBeNull();
    expect(container.querySelectorAll(".desktop-editor-pane")).toHaveLength(1);
    expect(container.querySelector(".desktop-editor-pane-handle")).toBeNull();
  });

  it("opens one Explorer file at the nearest pane edge on drop", () => {
    const onOpenAtPaneEdge = vi.fn();
    const group = openEditor(EMPTY_EDITOR_GROUP, createEditorInput("a.md"));
    const container = renderSplitView(group, createEditorPaneLayout("a.md"), {
      onOpenAtPaneEdge,
    });
    const pane = container.querySelector<HTMLElement>(".desktop-editor-pane")!;
    pane.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600);
    const node: DataNode = {
      id: "b.md",
      name: "b.md",
      path: "b.md",
      type: "file",
      source: "local",
    };
    const transfer = new DataTransfer();
    transfer.setData(
      EXPLORER_REFERENCE_DRAG_TYPE,
      serializeExplorerReferenceDrag("workspace", [node]),
    );

    act(() => pane.dispatchEvent(dragEvent("dragover", transfer, 790, 300)));
    expect(pane.dataset.dropTarget).toBe("right");
    expect(pane.dataset.dropKind).toBe("file");

    act(() => pane.dispatchEvent(dragEvent("drop", transfer, 790, 300)));
    expect(onOpenAtPaneEdge).toHaveBeenCalledWith(
      "b.md",
      "b.md",
      "editor-pane-1",
      "horizontal",
      "second",
    );
    expect(pane.dataset.dropTarget).toBeUndefined();
  });

  it("uses the grab handle only to move an existing pane", () => {
    const onMovePane = vi.fn();
    let group = openEditor(EMPTY_EDITOR_GROUP, createEditorInput("a.md"));
    group = openEditor(group, createEditorInput("b.md"));
    let layout = splitEditorPane(createEditorPaneLayout("a.md"), "editor-pane-1", "horizontal");
    layout = assignEditorToActivePane(layout, "b.md");
    const container = renderSplitView(group, layout, { onMovePane });
    const panes = container.querySelectorAll<HTMLElement>(".desktop-editor-pane");
    const handle = panes[0]!.querySelector<HTMLButtonElement>(".desktop-editor-pane-handle")!;
    panes[1]!.getBoundingClientRect = () => new DOMRect(400, 0, 400, 600);
    const capturedPointers = new Set<number>();
    handle.setPointerCapture = (pointerId) => capturedPointers.add(pointerId);
    handle.hasPointerCapture = (pointerId) => capturedPointers.has(pointerId);
    handle.releasePointerCapture = (pointerId) => capturedPointers.delete(pointerId);
    vi.spyOn(document, "elementFromPoint").mockReturnValue(panes[1]!);

    act(() => {
      handle.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true, button: 0, clientX: 200, clientY: 5, pointerId: 7,
      }));
      expect(document.body.classList.contains("desktop-editor-pane-dragging")).toBe(false);
      handle.dispatchEvent(new PointerEvent("pointermove", {
        bubbles: true, clientX: 790, clientY: 300, pointerId: 7,
      }));
    });
    expect(document.body.classList.contains("desktop-editor-pane-dragging")).toBe(true);
    expect(panes[1]!.dataset.dropTarget).toBe("right");

    act(() => handle.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true, clientX: 790, clientY: 300, pointerId: 7,
    })));
    expect(onMovePane).toHaveBeenCalledWith(
      "editor-pane-1",
      "editor-pane-2",
      "horizontal",
      "second",
    );
    expect(document.body.classList.contains("desktop-editor-pane-dragging")).toBe(false);
  });

  it("keeps pane menus exclusive without entering global drag state on click", () => {
    const { group, layout } = createThreePaneWorkspace();
    const container = renderSplitView(group, layout);
    const handles = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".desktop-editor-pane-handle"),
    );
    expect(handles).toHaveLength(3);
    handles.forEach(installPointerCaptureStub);

    clickPaneHandle(handles[0]!, 11);
    expect(document.body.classList.contains("desktop-editor-pane-dragging")).toBe(false);
    expect(handles.map((handle) => handle.getAttribute("aria-expanded"))).toEqual([
      "true", "false", "false",
    ]);
    expect(container.querySelectorAll('[role="menu"]')).toHaveLength(1);

    clickPaneHandle(handles[0]!, 13);
    expect(handles.every((handle) => handle.getAttribute("aria-expanded") === "false")).toBe(true);
    expect(container.querySelector('[role="menu"]')).toBeNull();

    clickPaneHandle(handles[2]!, 12);
    expect(document.body.classList.contains("desktop-editor-pane-dragging")).toBe(false);
    expect(handles.map((handle) => handle.getAttribute("aria-expanded"))).toEqual([
      "false", "false", "true",
    ]);
    expect(container.querySelectorAll('[role="menu"]')).toHaveLength(1);
  });

  it("activates a non-focusable pane after pointer selection completes", () => {
    const onFocusPane = vi.fn();
    const { group, layout } = createThreePaneWorkspace();
    const container = renderSplitView(group, layout, { onFocusPane });
    const panes = container.querySelectorAll<HTMLElement>(".desktop-editor-pane");
    const inactivePane = panes[0]!;

    act(() => inactivePane.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true, button: 0, pointerId: 21,
    })));
    expect(onFocusPane).not.toHaveBeenCalled();

    act(() => inactivePane.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true, button: 0, pointerId: 21,
    })));
    expect(onFocusPane).toHaveBeenCalledWith("editor-pane-1");
  });

  it("keeps three CodeMirror focus and selection states isolated across pane activation", async () => {
    const { group, layout } = createThreePaneWorkspace("txt");
    const state = {
      ...emptyWorkspaceState(),
      tree: ["a.txt", "b.txt", "c.txt"].map((path) => ({
        id: path,
        name: path,
        path,
        type: "text" as const,
        source: "local" as const,
      })),
    };
    const dataPort = {
      listChildren: async () => state.tree,
      readFile: async (path: string) => ({
        path,
        name: path,
        type: "text" as const,
        content: `${path} has independent editor state`,
        version: `version:${path}`,
      }),
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    function Harness() {
      const [currentLayout, setCurrentLayout] = React.useState(layout);
      return withTestLocalization(
        <DesktopEditorSplitView
          aiEditRequest={null}
          dataPort={dataPort}
          editorGroup={group}
          editorInteractionPreferences={{ showSaveStatus: false, markdownBlockDragEnabled: false }}
          fileIconTheme="default"
          layout={currentLayout}
          state={state}
          workspace={{ id: "workspace", name: "Workspace", path: "/workspace", status: "recording" }}
          onClosePane={vi.fn()}
          onFocusPane={(paneId) => setCurrentLayout((current) => activateEditorPane(current, paneId))}
          onMovePane={vi.fn()}
          onOpenAtPaneEdge={vi.fn()}
          onResizeSplit={vi.fn()}
        />,
      );
    }

    await act(async () => root?.render(<Harness />));
    await waitForCondition(() => container.querySelectorAll(".cm-editor").length === 3);
    const editorElements = Array.from(container.querySelectorAll<HTMLElement>(".cm-editor"));
    const views = editorElements.map((element) => EditorView.findFromDOM(element));

    act(() => {
      views[0]!.dispatch({ selection: { anchor: 1 } });
      views[1]!.dispatch({ selection: { anchor: 2 } });
      views[2]!.dispatch({ selection: { anchor: 3 } });
      views[0]!.focus();
    });
    expect(container.querySelector('[data-editor-pane-id="editor-pane-1"]')?.dataset.active)
      .toBe("true");
    expect(views[0]!.contentDOM.contains(document.activeElement)).toBe(true);

    act(() => views[1]!.focus());
    expect(container.querySelector('[data-editor-pane-id="editor-pane-2"]')?.dataset.active)
      .toBe("true");
    expect(views[1]!.contentDOM.contains(document.activeElement)).toBe(true);
    expect(views.map((view) => view.state.selection.main.anchor)).toEqual([1, 2, 3]);
    expect(Array.from(container.querySelectorAll<HTMLElement>(".cm-editor")).map(
      (element) => EditorView.findFromDOM(element),
    )).toEqual(views);

    const surfaceRender = vi.spyOn(DocumentSurfaceHost.prototype, "render");
    const activeHandle = container.querySelector<HTMLElement>(
      '[data-editor-pane-id="editor-pane-2"] .desktop-editor-pane-handle',
    )!;
    installPointerCaptureStub(activeHandle);
    clickPaneHandle(activeHandle, 31);
    expect(surfaceRender).not.toHaveBeenCalled();

    act(() => views[0]!.focus());
    expect(container.querySelector('[data-editor-pane-id="editor-pane-1"]')?.dataset.active)
      .toBe("true");
    expect(surfaceRender).not.toHaveBeenCalled();
  });
});

function renderSplitView(
  editorGroup: EditorGroupState,
  layout: EditorPaneLayoutState,
  callbacks: {
    onMovePane?: React.ComponentProps<typeof DesktopEditorSplitView>["onMovePane"];
    onOpenAtPaneEdge?: React.ComponentProps<typeof DesktopEditorSplitView>["onOpenAtPaneEdge"];
    onFocusPane?: React.ComponentProps<typeof DesktopEditorSplitView>["onFocusPane"];
  } = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(withTestLocalization(
    <DesktopEditorSplitView
      aiEditRequest={null}
      dataPort={{ listChildren: async () => [] }}
      editorGroup={editorGroup}
      editorInteractionPreferences={{ showSaveStatus: false, markdownBlockDragEnabled: false }}
      fileIconTheme="default"
      layout={layout}
      state={emptyWorkspaceState()}
      workspace={{ id: "workspace", name: "Workspace", path: "/workspace", status: "recording" }}
      onClosePane={vi.fn()}
      onFocusPane={callbacks.onFocusPane ?? vi.fn()}
      onMovePane={callbacks.onMovePane ?? vi.fn()}
      onOpenAtPaneEdge={callbacks.onOpenAtPaneEdge ?? vi.fn()}
      onResizeSplit={vi.fn()}
    />,
  )));
  return container;
}

function createThreePaneWorkspace(extension = "md") {
  const paths = ["a", "b", "c"].map((name) => `${name}.${extension}`);
  let group = openEditor(EMPTY_EDITOR_GROUP, createEditorInput(paths[0]!));
  group = openEditor(group, createEditorInput(paths[1]!));
  group = openEditor(group, createEditorInput(paths[2]!));
  let layout = splitEditorPane(createEditorPaneLayout(paths[0]!), "editor-pane-1", "horizontal");
  layout = assignEditorToActivePane(layout, paths[1]!);
  layout = splitEditorPane(layout, layout.activePaneId, "vertical");
  layout = assignEditorToActivePane(layout, paths[2]!);
  return { group, layout };
}

function installPointerCaptureStub(handle: HTMLElement) {
  const capturedPointers = new Set<number>();
  handle.setPointerCapture = (pointerId) => capturedPointers.add(pointerId);
  handle.hasPointerCapture = (pointerId) => capturedPointers.has(pointerId);
  handle.releasePointerCapture = (pointerId) => capturedPointers.delete(pointerId);
}

function clickPaneHandle(handle: HTMLElement, pointerId: number) {
  act(() => {
    handle.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true, button: 0, clientX: 100, clientY: 5, pointerId,
    }));
    handle.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true, button: 0, clientX: 100, clientY: 5, pointerId,
    }));
    handle.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
  });
}

function dragEvent(type: string, dataTransfer: DataTransfer, clientX: number, clientY: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    dataTransfer: { value: dataTransfer },
    clientX: { value: clientX },
    clientY: { value: clientY },
  });
  return event;
}

async function waitForCondition(condition: () => boolean, attempts = 200) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (condition()) return;
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 5)));
  }
  throw new Error("Timed out waiting for split editor state.");
}

function emptyWorkspaceState(): DataWorkspaceState {
  return {
    tree: [],
    activePath: null,
    activeNode: null,
    selectedPaths: [],
    selectedNodes: [],
    currentFolderPath: null,
    selectedFile: null,
    loadingPath: null,
    loadError: null,
    rootLoading: false,
    fileContent: null,
    fileLoading: false,
    fileError: null,
    fileUrl: null,
    fileUrlLoading: false,
    fileUrlError: null,
    markdownLinkGraph: {
      documentCount: 0,
      indexedDocumentCount: 0,
      isIndexing: false,
      resolveWikiLink: () => ({ exists: false, ambiguous: false, path: null, name: "", displayName: "", target: "" }),
      resolveMarkdownLink: () => null,
      getBacklinks: () => [],
    },
    markdownAssetUrlResolver: () => null,
  };
}
