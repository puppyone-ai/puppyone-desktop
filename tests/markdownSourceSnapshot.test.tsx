/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownCodeMirrorEditor } from "../vendor/shared-ui/src/editor/markdown/MarkdownCodeMirrorEditor";
import type { EditorSourceSnapshotPort } from "../vendor/shared-ui/src/editor/sourceSnapshot";
import { TextEditorFrame } from "../vendor/shared-ui/src/editor/viewers/TextEditorFrame";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("Markdown source snapshot boundary", () => {
  it("does not stringify the complete document during an ordinary input transaction", async () => {
    let snapshotPort: EditorSourceSnapshotPort | null = null;
    const onRevision = vi.fn();
    const container = await renderEditor(
      <MarkdownCodeMirrorEditor
        value={makeLargeSource(10_000)}
        readOnly={false}
        livePreview
        documentPath="large.md"
        onSourceRevisionChange={onRevision}
        onSnapshotPortChange={(port) => { snapshotPort = port; }}
      />,
    );
    const view = getEditorView(container);
    const toStringSpy = vi.spyOn(Object.getPrototypeOf(view.state.doc), "toString");

    act(() => view.dispatch({ changes: { from: 5, to: 6, insert: "x" }, userEvent: "input.type" }));

    expect(toStringSpy).not.toHaveBeenCalled();
    expect(onRevision).toHaveBeenLastCalledWith(expect.objectContaining({ dirty: true }));
    expect(snapshotPort).not.toBeNull();
    const snapshot = snapshotPort!.readSnapshot();
    expect(snapshot.content[5]).toBe("x");
    expect(toStringSpy).toHaveBeenCalledTimes(1);
  });

  it("flushes the canonical EditorView snapshot before destruction", async () => {
    const onSaveContent = vi.fn(async () => undefined);
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <TextEditorFrame
          documentId="note.md"
          content="alpha"
          nodeName="note.md"
          defaultMode="live"
          canEdit
          onSaveContent={onSaveContent}
          hideSourceView
          saveMode="manual"
          sourceSnapshotMode
          renderLive={(value, controls) => (
            <MarkdownCodeMirrorEditor
              value={value}
              readOnly={false}
              livePreview={false}
              documentPath="note.md"
              onSourceRevisionChange={controls.onSourceRevisionChange}
              onSnapshotPortChange={controls.onSnapshotPortChange}
              onBeforeDestroy={controls.onBeforeDestroy}
            />
          )}
        />,
      );
    });
    const view = getEditorView(container);
    act(() => view.dispatch({ changes: { from: 5, insert: " beta" }, userEvent: "input.type" }));

    act(() => root?.unmount());
    root = null;

    expect(onSaveContent).toHaveBeenCalledWith("alpha beta");
  });

  it("applies an external source update without a dirty writeback loop", async () => {
    const onRevision = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const render = (value: string) => (
      <MarkdownCodeMirrorEditor
        value={value}
        readOnly={false}
        livePreview={false}
        documentPath="external.md"
        onSourceRevisionChange={onRevision}
      />
    );
    await act(async () => root?.render(render("alpha")));
    onRevision.mockClear();
    await act(async () => root?.render(render("bravo")));

    const view = getEditorView(container);
    expect(view.state.doc.toString()).toBe("bravo");
    expect(onRevision).toHaveBeenCalledTimes(1);
    expect(onRevision).toHaveBeenCalledWith(expect.objectContaining({ dirty: false }));
  });
});

async function renderEditor(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root?.render(element));
  return container;
}

function getEditorView(container: HTMLElement): EditorView {
  const editor = container.querySelector<HTMLElement>(".cm-editor");
  if (!editor) throw new Error("CodeMirror editor did not mount.");
  return EditorView.findFromDOM(editor);
}

function makeLargeSource(lines: number): string {
  return Array.from({ length: lines }, (_, index) => `Paragraph ${index} with **bold** text.`).join("\n");
}
