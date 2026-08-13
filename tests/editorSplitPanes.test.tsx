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
});

describe("DesktopEditorSplitView", () => {
  it("uses pane controls instead of a tablist and exposes both split directions", () => {
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
    expect(container.querySelectorAll(".desktop-editor-pane")).toHaveLength(1);
    const splitRight = container.querySelector<HTMLButtonElement>('[aria-label="Split editor right"]');
    const splitDown = container.querySelector<HTMLButtonElement>('[aria-label="Split editor down"]');
    expect(splitRight).not.toBeNull();
    expect(splitDown).not.toBeNull();

    act(() => splitRight?.click());
    act(() => splitDown?.click());
    expect(onSplitPane.mock.calls).toEqual([
      ["editor-pane-1", "horizontal"],
      ["editor-pane-1", "vertical"],
    ]);
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
