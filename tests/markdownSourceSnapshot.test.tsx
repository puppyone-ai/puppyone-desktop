/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownCodeMirrorEditor } from "../packages/shared-ui/src/editor/markdown/MarkdownCodeMirrorEditor";
import { markdownRevealedSourceField } from "../packages/shared-ui/src/editor/markdown/core/state/revealedSource";
import type { EditorSourceSnapshotPort } from "../packages/shared-ui/src/editor/sourceSnapshot";
import { DocumentSessionBoundary } from "../packages/shared-ui/src/editor/document-session/DocumentSessionBoundary";
import { TextEditorFrame } from "../packages/shared-ui/src/editor/viewers/TextEditorFrame";
import { withTestLocalization } from "./testLocalization";

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

  it("starts frontend Markdown persistence immediately after an edit transaction", async () => {
    const persist = vi.fn(async () => ({ version: "v2" }));
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(withTestLocalization(
        <DocumentSessionBoundary
          documentId="instant.md"
          initialContent="alpha"
          initialVersion="v1"
          saveMode="auto"
          persistence={{ kind: "local-fs", persist }}
        >
          <TextEditorFrame
            documentId="instant.md"
            content="alpha"
            nodeName="instant.md"
            defaultMode="live"
            canEdit
            hideSourceView
            sourceSnapshotMode
            renderLive={(value, controls) => (
              <MarkdownCodeMirrorEditor
                value={value}
                readOnly={false}
                livePreview={false}
                documentPath="instant.md"
                onSourceRevisionChange={controls.onSourceRevisionChange}
                onSnapshotPortChange={controls.onSnapshotPortChange}
              />
            )}
          />
        </DocumentSessionBoundary>,
      ));
    });
    const view = getEditorView(container);

    act(() => view.dispatch({
      changes: { from: 5, insert: " beta" },
      userEvent: "input.type",
    }));
    expect(persist).not.toHaveBeenCalled();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({
      path: "instant.md",
      content: "alpha beta",
      reason: "edit",
    }));
  });

  it("keeps an immediate-save failure visible and retryable in auto mode", async () => {
    const persist = vi.fn(async () => {
      throw new Error("disk unavailable");
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(withTestLocalization(
        <DocumentSessionBoundary
          documentId="failure.md"
          initialContent="alpha"
          initialVersion="v1"
          saveMode="auto"
          persistence={{ kind: "local-fs", persist }}
        >
          <TextEditorFrame
            documentId="failure.md"
            content="alpha"
            nodeName="failure.md"
            defaultMode="live"
            canEdit
            hideSourceView
            sourceSnapshotMode
            renderLive={(value, controls) => (
              <MarkdownCodeMirrorEditor
                value={value}
                readOnly={false}
                livePreview={false}
                documentPath="failure.md"
                onSourceRevisionChange={controls.onSourceRevisionChange}
                onSnapshotPortChange={controls.onSnapshotPortChange}
              />
            )}
          />
        </DocumentSessionBoundary>,
      ));
    });

    act(() => getEditorView(container).dispatch({
      changes: { from: 5, insert: " beta" },
      userEvent: "input.type",
    }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector(".editor-inline-error")).not.toBeNull();
    expect(container.querySelector(".editor-save-chip.error")).not.toBeNull();
  });

  it("flushes the canonical EditorView snapshot before destruction", async () => {
    const persist = vi.fn(async () => ({ version: "v2" }));
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(withTestLocalization(
        <DocumentSessionBoundary
          documentId="note.md"
          initialContent="alpha"
          initialVersion="v1"
          saveMode="manual"
          persistence={{ kind: "local-fs", persist }}
        >
          <TextEditorFrame
            documentId="note.md"
            content="alpha"
            nodeName="note.md"
            defaultMode="live"
            canEdit
            hideSourceView
            sourceSnapshotMode
            renderLive={(value, controls) => (
              <MarkdownCodeMirrorEditor
                value={value}
                readOnly={false}
                livePreview={false}
                documentPath="note.md"
                onSourceRevisionChange={controls.onSourceRevisionChange}
                onSnapshotPortChange={controls.onSnapshotPortChange}
              />
            )}
          />
        </DocumentSessionBoundary>,
      ));
    });
    const view = getEditorView(container);
    act(() => view.dispatch({ changes: { from: 5, insert: " beta" }, userEvent: "input.type" }));

    act(() => root?.unmount());
    root = null;
    await act(async () => Promise.resolve());

    expect(persist).toHaveBeenCalledWith(expect.objectContaining({
      path: "note.md",
      content: "alpha beta",
      reason: "destroy",
    }));
  });

  it("reloads an explicitly chosen external version into CodeMirror", async () => {
    const persistence = {
      kind: "local-fs" as const,
      persist: vi.fn(async () => ({ version: "saved" })),
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const render = (content: string, version: string) => withTestLocalization(
      <DocumentSessionBoundary
        documentId="conflict.md"
        initialContent="alpha"
        initialVersion="v1"
        saveMode="manual"
        persistence={persistence}
      >
        <TextEditorFrame
          documentId="conflict.md"
          documentVersion={version}
          content={content}
          nodeName="conflict.md"
          defaultMode="live"
          canEdit
          hideSourceView
          sourceSnapshotMode
          renderLive={(value, controls) => (
            <MarkdownCodeMirrorEditor
              value={value}
              readOnly={false}
              livePreview={false}
              documentPath="conflict.md"
              onSourceRevisionChange={controls.onSourceRevisionChange}
              onSnapshotPortChange={controls.onSnapshotPortChange}
            />
          )}
        />
      </DocumentSessionBoundary>,
    );

    await act(async () => root?.render(render("alpha", "v1")));
    act(() => getEditorView(container).dispatch({
      changes: { from: 5, insert: " human" },
      userEvent: "input.type",
    }));
    await act(async () => root?.render(render("agent version", "v2")));
    expect(getEditorView(container).state.doc.toString()).toBe("alpha human");

    const reload = [...container.querySelectorAll<HTMLButtonElement>(".editor-conflict-actions button")]
      .find((button) => button.textContent === "Load external version");
    await act(async () => reload?.click());

    expect(getEditorView(container).state.doc.toString()).toBe("agent version");
    expect(persistence.persist).not.toHaveBeenCalled();
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
    await act(async () => root?.render(withTestLocalization(render("alpha"))));
    onRevision.mockClear();
    await act(async () => root?.render(withTestLocalization(render("bravo"))));

    const view = getEditorView(container);
    expect(view.state.doc.toString()).toBe("bravo");
    expect(onRevision).toHaveBeenCalledTimes(1);
    expect(onRevision).toHaveBeenCalledWith(expect.objectContaining({ dirty: false }));
  });

  it("does not replace the CodeMirror document when a controlled host echoes identical local bytes", async () => {
    const initial = "Before\n![diagram](assets/diagram.png)\nAfter";
    const resolveAssetUrl = vi.fn(async () => "blob:https://app/controlled-image");
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const render = (value: string) => withTestLocalization(
      <MarkdownCodeMirrorEditor
        value={value}
        readOnly={false}
        livePreview
        documentPath="controlled.md"
        markdownAssetUrlResolver={resolveAssetUrl}
      />,
    );

    await act(async () => root?.render(render(initial)));
    await waitForDom(() => container.querySelector(".cm-md-image-widget img") !== null);
    const view = getEditorView(container);
    const wrapperBefore = container.querySelector<HTMLElement>(".cm-md-image-widget");
    const imageBefore = wrapperBefore?.querySelector<HTMLImageElement>("img");
    if (!wrapperBefore || !imageBefore) throw new Error("Markdown image widget did not mount.");
    Object.defineProperty(imageBefore, "decode", { configurable: true, value: undefined });
    imageBefore.dispatchEvent(new Event("load"));

    const localValue = `${initial}!`;
    act(() => view.dispatch({
      changes: { from: view.state.doc.length, insert: "!" },
      userEvent: "input.type",
    }));
    await act(async () => root?.render(render(localValue)));

    expect(view.state.doc.toString()).toBe(localValue);
    expect(container.querySelector(".cm-md-image-widget")).toBe(wrapperBefore);
    expect(wrapperBefore.querySelector("img")).toBe(imageBefore);
    expect(resolveAssetUrl).toHaveBeenCalledTimes(1);
  });

  it("clears a revealed HTML source range when an external document replaces the editor", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const render = (value: string) => withTestLocalization(
      <MarkdownCodeMirrorEditor
        value={value}
        readOnly={false}
        livePreview
        documentPath="external-html.md"
      />,
    );

    await act(async () => root?.render(render("<div>local</div>")));
    await waitForDom(() => container.querySelector(".cm-md-html-source-toggle") !== null);
    const view = getEditorView(container);
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".cm-md-html-source-toggle")?.click();
      await Promise.resolve();
    });
    expect(view.state.field(markdownRevealedSourceField)?.presentation).toBe("block");

    await act(async () => root?.render(render("<div>external</div>")));
    expect(view.state.doc.toString()).toBe("<div>external</div>");
    expect(view.state.field(markdownRevealedSourceField)).toBeNull();
    await waitForDom(() => container.querySelector(".cm-md-html-widget") !== null);
  });
});

async function renderEditor(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root?.render(withTestLocalization(element)));
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

async function waitForDom(assertion: () => boolean, attempts = 100): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (assertion()) return;
    await act(async () => {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 2));
    });
  }
  throw new Error("Timed out waiting for Markdown DOM state.");
}
