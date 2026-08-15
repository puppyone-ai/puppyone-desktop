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
  assignEditorToPane,
  createEditorInput,
  createEditorPaneLayout,
  moveEditorPane,
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

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  delete window.puppyoneDesktop;
  vi.restoreAllMocks();
});

describe("DesktopEditorSplitView", () => {
  it("keeps the pane actions handle when only one pane exists", () => {
    const group = openEditor(EMPTY_EDITOR_GROUP, createEditorInput("a.md"));
    const container = renderSplitView(group, createEditorPaneLayout("a.md"));
    const pane = container.querySelector<HTMLElement>(".desktop-editor-pane")!;
    const handle = container.querySelector<HTMLButtonElement>(".desktop-editor-pane-handle")!;
    pane.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600);

    expect(container.querySelector('[role="tablist"]')).toBeNull();
    expect(container.querySelector(".desktop-editor-pane-bar")).toBeNull();
    expect(container.querySelectorAll(".desktop-editor-pane")).toHaveLength(1);
    expect(handle).not.toBeNull();

    act(() => pane.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true, clientX: 400, clientY: 100,
    })));
    expect(pane.dataset.handleHot).toBe("true");

    clickPaneHandle(handle, 1);
    expect(handle.getAttribute("aria-expanded")).toBe("true");
    const menu = document.querySelector('[role="menu"]');
    expect(menu).not.toBeNull();
    expect(menu?.closest("#desktop-overlay-root")).not.toBeNull();
    expect(pane.contains(menu)).toBe(false);
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

  it("clears an Explorer split preview when the window loses the drag session", () => {
    const group = openEditor(EMPTY_EDITOR_GROUP, createEditorInput("a.md"));
    const container = renderSplitView(group, createEditorPaneLayout("a.md"));
    const pane = container.querySelector<HTMLElement>(".desktop-editor-pane")!;
    pane.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600);
    const transfer = new DataTransfer();
    transfer.setData(
      EXPLORER_REFERENCE_DRAG_TYPE,
      serializeExplorerReferenceDrag("workspace", [{
        id: "b.md",
        name: "b.md",
        path: "b.md",
        type: "file",
        source: "local",
      }]),
    );

    act(() => pane.dispatchEvent(dragEvent("dragover", transfer, 790, 300)));
    expect(pane.dataset.dropTarget).toBe("right");

    act(() => window.dispatchEvent(new Event("blur")));
    expect(pane.dataset.dropTarget).toBeUndefined();
    expect(container.querySelector(".desktop-editor-drop-preview")).toBeNull();
  });

  it("reveals pane chrome only when the pointer is in the top third of a pane", () => {
    const capturePanePreview = vi.fn(async () => null);
    window.puppyoneDesktop = {
      capturePanePreview,
    } as NonNullable<typeof window.puppyoneDesktop>;
    const { group, layout } = createThreePaneWorkspace();
    const container = renderSplitView(group, layout);
    const pane = container.querySelector<HTMLElement>(".desktop-editor-pane")!;
    pane.getBoundingClientRect = () => new DOMRect(0, 0, 400, 600);

    expect(pane.dataset.handleHot).toBeUndefined();

    act(() => pane.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true, clientX: 200, clientY: 100,
    })));
    expect(pane.dataset.handleHot).toBe("true");
    expect(capturePanePreview).not.toHaveBeenCalled();

    act(() => pane.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true, clientX: 200, clientY: 400,
    })));
    expect(pane.dataset.handleHot).toBeUndefined();

    act(() => pane.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true })));
    expect(pane.dataset.handleHot).toBeUndefined();
  });

  it("keeps the grab dots visible while the pane menu is open", () => {
    const { group, layout } = createThreePaneWorkspace();
    const container = renderSplitView(group, layout);
    const pane = container.querySelector<HTMLElement>(".desktop-editor-pane")!;
    const handle = pane.querySelector<HTMLButtonElement>(".desktop-editor-pane-handle")!;
    pane.getBoundingClientRect = () => new DOMRect(0, 0, 400, 600);
    installPointerCaptureStub(handle);

    clickPaneHandle(handle, 41);
    expect(handle.getAttribute("aria-expanded")).toBe("true");
    expect(pane.dataset.handleHot).toBe("true");

    act(() => pane.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true })));
    expect(pane.dataset.handleHot).toBe("true");
  });

  it("uses the grab handle only to move an existing pane", async () => {
    const onMovePane = vi.fn();
    const capturePanePreview = vi.fn(async () => ({
      dataUrl: "data:image/png;base64,c25hcHNob3Q=",
      width: 104,
      height: 156,
    }));
    window.puppyoneDesktop = {
      capturePanePreview,
    } as NonNullable<typeof window.puppyoneDesktop>;
    let group = openEditor(EMPTY_EDITOR_GROUP, createEditorInput("a.md"));
    group = openEditor(group, createEditorInput("b.md"));
    let layout = splitEditorPane(createEditorPaneLayout("a.md"), "editor-pane-1", "horizontal");
    layout = assignEditorToActivePane(layout, "b.md");
    const container = renderSplitView(group, layout, { onMovePane });
    const panes = container.querySelectorAll<HTMLElement>(".desktop-editor-pane");
    const handle = panes[0]!.querySelector<HTMLButtonElement>(".desktop-editor-pane-handle")!;
    panes[0]!.getBoundingClientRect = () => new DOMRect(0, 0, 400, 600);
    panes[0]!.querySelector<HTMLElement>(".desktop-editor-pane-content")!
      .getBoundingClientRect = () => new DOMRect(0, 0, 400, 600);
    panes[1]!.getBoundingClientRect = () => new DOMRect(400, 0, 400, 600);
    const capturedPointers = new Set<number>();
    handle.setPointerCapture = (pointerId) => capturedPointers.add(pointerId);
    handle.hasPointerCapture = (pointerId) => capturedPointers.has(pointerId);
    handle.releasePointerCapture = (pointerId) => capturedPointers.delete(pointerId);
    vi.spyOn(document, "elementFromPoint").mockReturnValue(panes[1]!);

    act(() => handle.dispatchEvent(new PointerEvent("pointerover", {
      bubbles: true, clientX: 200, clientY: 5, pointerId: 7,
    })));
    expect(capturePanePreview).toHaveBeenCalledTimes(1);

    act(() => handle.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true, button: 0, clientX: 200, clientY: 5, pointerId: 7,
    })));
    expect(document.body.classList.contains("desktop-editor-pane-dragging")).toBe(false);
    expect(capturePanePreview).toHaveBeenCalledTimes(1);

    act(() => handle.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true, clientX: 201, clientY: 6, pointerId: 7,
    })));
    expect(document.body.classList.contains("desktop-editor-pane-dragging")).toBe(false);
    expect(capturePanePreview).toHaveBeenCalledTimes(1);

    act(() => handle.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true, clientX: 203, clientY: 7, pointerId: 7,
    })));
    expect(document.body.classList.contains("desktop-editor-pane-dragging")).toBe(true);
    expect(capturePanePreview).toHaveBeenCalledTimes(1);
    const preview = document.body.querySelector<HTMLElement>(".desktop-editor-pane-move-preview");
    expect(preview).not.toBeNull();
    expect(preview!.style.transform).toContain("203px");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(preview!.dataset.ready).toBe("true");
    expect(preview!.querySelector("img")?.getAttribute("src")).toContain("data:image/png");
    expect(panes[0]!.getAttribute("data-move-source")).toBe("true");

    act(() => handle.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true, clientX: 790, clientY: 300, pointerId: 7,
    })));
    expect(preview!.style.transform).toContain("790px");
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
    expect(document.body.querySelector(".desktop-editor-pane-move-preview")).toBeNull();
    expect(panes[0]!.getAttribute("data-move-source")).toBeNull();
  });

  it("cancels pane movement without swallowing the next menu press", () => {
    const onMovePane = vi.fn();
    let group = openEditor(EMPTY_EDITOR_GROUP, createEditorInput("a.md"));
    group = openEditor(group, createEditorInput("b.md"));
    let layout = splitEditorPane(createEditorPaneLayout("a.md"), "editor-pane-1", "horizontal");
    layout = assignEditorToActivePane(layout, "b.md");
    const container = renderSplitView(group, layout, { onMovePane });
    const panes = container.querySelectorAll<HTMLElement>(".desktop-editor-pane");
    const handle = panes[0]!.querySelector<HTMLButtonElement>(".desktop-editor-pane-handle")!;
    installPointerCaptureStub(handle);
    panes[1]!.getBoundingClientRect = () => new DOMRect(400, 0, 400, 600);
    vi.spyOn(document, "elementFromPoint").mockReturnValue(panes[1]!);

    act(() => {
      handle.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true, button: 0, clientX: 200, clientY: 5, pointerId: 17,
      }));
      handle.dispatchEvent(new PointerEvent("pointermove", {
        bubbles: true, clientX: 790, clientY: 300, pointerId: 17,
      }));
    });
    expect(panes[1]!.dataset.dropTarget).toBe("right");

    act(() => handle.dispatchEvent(new PointerEvent("lostpointercapture", {
      bubbles: true, pointerId: 17,
    })));
    expect(document.body.classList.contains("desktop-editor-pane-dragging")).toBe(false);
    expect(document.body.querySelector(".desktop-editor-pane-move-preview")).toBeNull();
    expect(panes[1]!.dataset.dropTarget).toBeUndefined();
    expect(onMovePane).not.toHaveBeenCalled();

    clickPaneHandle(handle, 18);
    expect(handle.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector(".desktop-editor-pane-menu")).not.toBeNull();
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
    expect(document.querySelectorAll('[role="menu"]')).toHaveLength(1);

    clickPaneHandle(handles[0]!, 13);
    expect(handles.every((handle) => handle.getAttribute("aria-expanded") === "false")).toBe(true);
    expect(document.querySelector('[role="menu"]')).toBeNull();

    clickPaneHandle(handles[2]!, 12);
    expect(document.body.classList.contains("desktop-editor-pane-dragging")).toBe(false);
    expect(handles.map((handle) => handle.getAttribute("aria-expanded"))).toEqual([
      "false", "false", "true",
    ]);
    expect(document.querySelectorAll('[role="menu"]')).toHaveLength(1);
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

  it("keeps mixed source transitions isolated inside a real three-pane split", async () => {
    const csv = "report.csv";
    const image = "diagram.png";
    const markdown = "notes.md";
    let group = openEditor(EMPTY_EDITOR_GROUP, createEditorInput(csv));
    group = openEditor(group, createEditorInput(image));
    group = openEditor(group, createEditorInput(markdown));
    let initialLayout = splitEditorPane(createEditorPaneLayout(csv), "editor-pane-1", "horizontal");
    initialLayout = assignEditorToActivePane(initialLayout, image);
    initialLayout = splitEditorPane(initialLayout, initialLayout.activePaneId, "vertical");
    initialLayout = assignEditorToActivePane(initialLayout, markdown);
    const tree: DataNode[] = [
      { id: csv, path: csv, name: csv, type: "spreadsheet", mimeType: "text/csv", source: "local" },
      { id: image, path: image, name: image, type: "image", mimeType: "image/png", source: "local" },
      { id: markdown, path: markdown, name: markdown, type: "markdown", mimeType: "text/markdown", source: "local" },
    ];
    const readFile = vi.fn(async (path: string) => ({
      path,
      name: path,
      type: path === csv ? "spreadsheet" as const : "markdown" as const,
      mimeType: path === csv ? "text/csv" : "text/markdown",
      content: `content:${path}`,
      version: `version:${path}:${readFile.mock.calls.length}`,
    }));
    const getFileUrl = vi.fn(async (path: string) => `blob:${path}`);
    const dataPort = { listChildren: async () => tree, readFile, getFileUrl };
    const state = { ...emptyWorkspaceState(), tree };
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    let updateLayout!: React.Dispatch<React.SetStateAction<EditorPaneLayoutState>>;

    function Harness() {
      const [layout, setLayout] = React.useState(initialLayout);
      updateLayout = setLayout;
      return withTestLocalization(
        <DesktopEditorSplitView
          aiEditRequest={null}
          dataPort={dataPort}
          editorGroup={group}
          editorInteractionPreferences={{ showSaveStatus: false, markdownBlockDragEnabled: false }}
          fileIconTheme="default"
          layout={layout}
          state={state}
          workspace={{ id: "workspace", name: "Workspace", path: "/workspace", status: "recording" }}
          onClosePane={vi.fn()}
          onFocusPane={vi.fn()}
          onMovePane={vi.fn()}
          onOpenAtPaneEdge={vi.fn()}
          onResizeSplit={vi.fn()}
          onSplitPane={vi.fn()}
        />,
      );
    }

    await act(async () => root?.render(<Harness />));
    await waitForCondition(() => (
      readCount(readFile, csv) === 1
      && readCount(readFile, markdown) === 1
      && getFileUrl.mock.calls.some(([path]) => path === image)
    ));
    expect(container.querySelectorAll(".desktop-editor-pane")).toHaveLength(3);

    await act(async () => updateLayout((layout) => assignEditorToPane(layout, "editor-pane-1", image)));
    await waitForCondition(() => (
      container.querySelector('[data-editor-pane-id="editor-pane-1"] img') !== null
      || getFileUrl.mock.calls.filter(([path]) => path === image).length >= 1
    ));
    await act(async () => updateLayout((layout) => assignEditorToPane(layout, "editor-pane-1", csv)));
    await waitForCondition(() => readCount(readFile, csv) === 2);

    expect(readCount(readFile, markdown)).toBe(1);
    expect(readCount(readFile, image)).toBe(0);
    expect(container.querySelectorAll(".desktop-editor-pane")).toHaveLength(3);
  });

  it("reorders two sibling panes without clearing or remounting their editor runtimes", async () => {
    const paths = ["left.txt", "right.txt"] as const;
    let group = openEditor(EMPTY_EDITOR_GROUP, createEditorInput(paths[0]));
    group = openEditor(group, createEditorInput(paths[1]));
    let initialLayout = splitEditorPane(
      createEditorPaneLayout(paths[0]),
      "editor-pane-1",
      "horizontal",
    );
    initialLayout = assignEditorToActivePane(initialLayout, paths[1]);
    const tree: DataNode[] = paths.map((path) => ({
      id: path,
      name: path,
      path,
      type: "text",
      source: "local",
    }));
    const readFile = vi.fn(async (path: string) => ({
      path,
      name: path,
      type: "text" as const,
      content: `stable content for ${path}`,
      version: `version:${path}`,
    }));
    const state = { ...emptyWorkspaceState(), tree };
    const dataPort = { listChildren: async () => tree, readFile };
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    window.puppyoneDesktop = {
      capturePanePreview: vi.fn(async () => null),
    } as NonNullable<typeof window.puppyoneDesktop>;

    function Harness() {
      const [layout, setLayout] = React.useState(initialLayout);
      return withTestLocalization(
        <DesktopEditorSplitView
          aiEditRequest={null}
          dataPort={dataPort}
          editorGroup={group}
          editorInteractionPreferences={{ showSaveStatus: false, markdownBlockDragEnabled: false }}
          fileIconTheme="default"
          layout={layout}
          state={state}
          workspace={{ id: "workspace", name: "Workspace", path: "/workspace", status: "recording" }}
          onClosePane={vi.fn()}
          onFocusPane={vi.fn()}
          onMovePane={(sourcePaneId, targetPaneId, direction, placement) => {
            setLayout((current) => moveEditorPane(
              current,
              sourcePaneId,
              targetPaneId,
              direction,
              placement,
            ));
          }}
          onOpenAtPaneEdge={vi.fn()}
          onResizeSplit={vi.fn()}
          onSplitPane={vi.fn()}
        />,
      );
    }

    await act(async () => root?.render(<Harness />));
    await waitForCondition(() => container.querySelectorAll(".cm-editor").length === 2);
    const originalViews = new Map(
      Array.from(container.querySelectorAll<HTMLElement>(".desktop-editor-pane")).map((pane) => [
        pane.dataset.editorPaneId!,
        EditorView.findFromDOM(pane.querySelector<HTMLElement>(".cm-editor")!),
      ]),
    );
    const panes = container.querySelectorAll<HTMLElement>(".desktop-editor-pane");
    const leftPane = panes[0]!;
    const rightPane = panes[1]!;
    leftPane.getBoundingClientRect = () => new DOMRect(0, 0, 400, 600);
    rightPane.getBoundingClientRect = () => new DOMRect(400, 0, 400, 600);
    rightPane.querySelector<HTMLElement>(".desktop-editor-pane-content")!
      .getBoundingClientRect = () => new DOMRect(400, 0, 400, 600);
    const rightHandle = rightPane.querySelector<HTMLButtonElement>(
      ".desktop-editor-pane-handle",
    )!;
    installPointerCaptureStub(rightHandle);
    vi.spyOn(document, "elementFromPoint").mockReturnValue(leftPane);

    await act(async () => {
      rightHandle.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true, button: 0, clientX: 600, clientY: 5, pointerId: 71,
      }));
      rightHandle.dispatchEvent(new PointerEvent("pointermove", {
        bubbles: true, clientX: 10, clientY: 300, pointerId: 71,
      }));
      rightHandle.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true, button: 0, clientX: 10, clientY: 300, pointerId: 71,
      }));
      await Promise.resolve();
    });

    expect(Array.from(container.querySelectorAll<HTMLElement>(".desktop-editor-pane")).map(
      (pane) => pane.dataset.editorPaneId,
    )).toEqual(["editor-pane-2", "editor-pane-1"]);
    expect(readFile).toHaveBeenCalledTimes(2);
    for (const [paneId, originalView] of originalViews) {
      const pane = container.querySelector<HTMLElement>(`[data-editor-pane-id="${paneId}"]`)!;
      expect(EditorView.findFromDOM(pane.querySelector<HTMLElement>(".cm-editor")!))
        .toBe(originalView);
    }
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
          onSplitPane={vi.fn()}
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
  onSplitPane?: React.ComponentProps<typeof DesktopEditorSplitView>["onSplitPane"];
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
      onSplitPane={callbacks.onSplitPane ?? vi.fn()}
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
    handle.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0, detail: 1 }));
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

function readCount(readFile: ReturnType<typeof vi.fn>, path: string) {
  return readFile.mock.calls.filter(([readPath]) => readPath === path).length;
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
