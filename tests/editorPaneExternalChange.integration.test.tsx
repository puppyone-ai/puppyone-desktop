/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_MARKDOWN_WORKSPACE_ENVIRONMENT,
  type DataNode,
  type DataPort,
  type FileContent,
} from "@puppyone/shared-ui";
import { closeDocumentWorkingCopy } from "../packages/shared-ui/src/editor/document-session/documentWorkingCopies";
import { EditorPaneDocumentRuntime } from "../src/features/editor-workbench/runtime/EditorPaneDocumentRuntime";
import { withTestLocalization } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await closeDocumentWorkingCopy({
    storageIdentity: "test:editor-pane-external-change",
    resourcePath: "note.md",
  }).catch(() => undefined);
  document.body.innerHTML = "";
});

describe("split-pane external document change", () => {
  it("adopts an Agent edit while the Markdown pane stays open and performs zero writeback", async () => {
    let storage: FileContent = {
      path: "note.md",
      name: "note.md",
      type: "markdown",
      content: "alpha",
      version: "v1",
    };
    const persist = vi.fn(async () => ({ ok: true as const, version: "unexpected" }));
    const readFile = vi.fn(async () => storage);
    const dataPort: DataPort = {
      listChildren: vi.fn(async () => []),
      readFile,
      documentPersistence: {
        kind: "local-fs",
        storageIdentity: "test:editor-pane-external-change",
        persist,
      },
    };
    const node: DataNode = {
      id: "note.md",
      path: "note.md",
      name: "note.md",
      type: "markdown",
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const render = (refreshKey: { sequence: number; paths: readonly string[] | null }) => {
      root?.render(withTestLocalization(
        <EditorPaneDocumentRuntime
          aiEditFile={null}
          dataPort={dataPort}
          editor={{ id: "note.md", resource: "note.md", label: "note.md" }}
          editorInteractionPreferences={{
            showSaveStatus: false,
            markdownBlockDragEnabled: false,
          }}
          fileIconTheme="default"
          markdownEnvironment={EMPTY_MARKDOWN_WORKSPACE_ENVIRONMENT}
          refreshKey={refreshKey}
          treeNode={node}
          workspaceId="workspace"
          workspaceRoot="/workspace"
          markdownDialect="puppy-gfm"
        />,
      ));
    };

    await act(async () => render({ sequence: 0, paths: null }));
    await waitFor(
      () => editorContent(container) === "alpha",
      () => `Initial editor failed: ${container.innerHTML}`,
    );

    storage = { ...storage, content: "agent version", version: "v2" };
    await act(async () => render({ sequence: 1, paths: ["note.md"] }));
    await waitFor(
      () => editorContent(container) === "agent version",
      () => `External update failed: ${container.innerHTML}`,
    );

    expect(readFile).toHaveBeenCalledTimes(2);
    expect(persist).not.toHaveBeenCalled();
    expect(container.querySelector(".editor-inline-error")).toBeNull();

    await act(async () => render({ sequence: 2, paths: ["other.md"] }));
    await act(async () => Promise.resolve());
    expect(readFile).toHaveBeenCalledTimes(2);
  });
});

function editorContent(container: HTMLElement): string | null {
  const editor = container.querySelector<HTMLElement>(".cm-editor");
  return editor ? EditorView.findFromDOM(editor).state.doc.toString() : null;
}

async function waitFor(
  assertion: () => boolean,
  failure: () => string,
  attempts = 400,
): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (assertion()) return;
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 5));
    });
  }
  throw new Error(failure());
}
