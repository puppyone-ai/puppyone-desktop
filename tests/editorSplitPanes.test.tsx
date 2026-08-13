/** @vitest-environment happy-dom */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_EDITOR_GROUP,
  createEditorPaneLayout,
  type DataWorkspaceState,
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
  it("uses a hidden grab handle instead of pane headers or a tablist", () => {
    const onSplitPane = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => root?.render(withTestLocalization(
      <DesktopEditorSplitView
        aiEditRequest={null}
        dataPort={{ listChildren: async () => [] }}
        editorGroup={EMPTY_EDITOR_GROUP}
        editorInteractionPreferences={{ showSaveStatus: false, markdownBlockDragEnabled: false }}
        fileIconTheme="default"
        layout={createEditorPaneLayout()}
        state={emptyWorkspaceState()}
        workspace={{ id: "workspace", name: "Workspace", path: "/workspace", status: "recording" }}
        onCloseEditor={vi.fn()}
        onClosePane={vi.fn()}
        onFocusPane={vi.fn()}
        onResizeSplit={vi.fn()}
        onSplitPane={onSplitPane}
      />,
    )));

    expect(container.querySelector('[role="tablist"]')).toBeNull();
    expect(container.querySelector(".desktop-editor-pane-bar")).toBeNull();
    expect(container.querySelectorAll(".desktop-editor-pane")).toHaveLength(1);
    const handle = container.querySelector<HTMLButtonElement>(".desktop-editor-pane-handle");
    expect(handle?.querySelectorAll("i")).toHaveLength(3);

    act(() => handle?.click());
    const splitLeft = container.querySelector<HTMLButtonElement>('[aria-label="Split editor left"]');
    const splitRight = container.querySelector<HTMLButtonElement>('[aria-label="Split editor right"]');
    const splitDown = container.querySelector<HTMLButtonElement>('[aria-label="Split editor down"]');
    expect(splitLeft).not.toBeNull();
    expect(splitRight).not.toBeNull();
    expect(splitDown).not.toBeNull();

    act(() => splitLeft?.click());
    expect(onSplitPane).toHaveBeenCalledWith(
      "editor-pane-1",
      "horizontal",
      { editorId: null, placement: "first" },
    );
  });

  it("previews the nearest edge and commits a split when the grab handle is dragged", () => {
    const onSplitPane = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => root?.render(withTestLocalization(
      <DesktopEditorSplitView
        aiEditRequest={null}
        dataPort={{ listChildren: async () => [] }}
        editorGroup={EMPTY_EDITOR_GROUP}
        editorInteractionPreferences={{ showSaveStatus: false, markdownBlockDragEnabled: false }}
        fileIconTheme="default"
        layout={createEditorPaneLayout()}
        state={emptyWorkspaceState()}
        workspace={{ id: "workspace", name: "Workspace", path: "/workspace", status: "recording" }}
        onCloseEditor={vi.fn()}
        onClosePane={vi.fn()}
        onFocusPane={vi.fn()}
        onResizeSplit={vi.fn()}
        onSplitPane={onSplitPane}
      />,
    )));

    const pane = container.querySelector<HTMLElement>(".desktop-editor-pane")!;
    const handle = container.querySelector<HTMLButtonElement>(".desktop-editor-pane-handle")!;
    pane.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600);
    const capturedPointers = new Set<number>();
    handle.setPointerCapture = (pointerId) => capturedPointers.add(pointerId);
    handle.hasPointerCapture = (pointerId) => capturedPointers.has(pointerId);
    handle.releasePointerCapture = (pointerId) => capturedPointers.delete(pointerId);
    vi.spyOn(document, "elementFromPoint").mockReturnValue(pane);

    act(() => {
      handle.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true, button: 0, clientX: 400, clientY: 5, pointerId: 7,
      }));
      handle.dispatchEvent(new PointerEvent("pointermove", {
        bubbles: true, clientX: 790, clientY: 300, pointerId: 7,
      }));
    });
    expect(pane.dataset.dropTarget).toBe("right");

    act(() => handle.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true, clientX: 790, clientY: 300, pointerId: 7,
    })));
    expect(onSplitPane).toHaveBeenCalledWith(
      "editor-pane-1",
      "horizontal",
      { editorId: null, placement: "second" },
    );
  });
});

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
