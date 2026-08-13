/** @vitest-environment happy-dom */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_EDITOR_GROUP,
  EXPLORER_REFERENCE_DRAG_TYPE,
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
import { DesktopEditorSplitView } from "../src/features/editor-workbench/DesktopEditorSplitView";
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
      handle.dispatchEvent(new PointerEvent("pointermove", {
        bubbles: true, clientX: 790, clientY: 300, pointerId: 7,
      }));
    });
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
  });
});

function renderSplitView(
  editorGroup: EditorGroupState,
  layout: EditorPaneLayoutState,
  callbacks: {
    onMovePane?: React.ComponentProps<typeof DesktopEditorSplitView>["onMovePane"];
    onOpenAtPaneEdge?: React.ComponentProps<typeof DesktopEditorSplitView>["onOpenAtPaneEdge"];
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
      onFocusPane={vi.fn()}
      onMovePane={callbacks.onMovePane ?? vi.fn()}
      onOpenAtPaneEdge={callbacks.onOpenAtPaneEdge ?? vi.fn()}
      onResizeSplit={vi.fn()}
    />,
  )));
  return container;
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
