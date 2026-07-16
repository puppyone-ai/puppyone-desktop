/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentSessionBoundary } from "../packages/shared-ui/src/editor/document-session/DocumentSessionBoundary";
import { TextEditorFrame } from "../packages/shared-ui/src/editor/viewers/TextEditorFrame";
import { withTestLocalization } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("editable document external changes", () => {
  it("reloads an external file version when the editor is clean", async () => {
    const persistence = createPersistence();
    const harness = createHarness(persistence);

    await act(async () => harness.render("one", "v1"));
    await act(async () => harness.render("agent update", "v2"));

    expect(harness.value()).toBe("agent update");
    expect(persistence.persist).not.toHaveBeenCalled();
  });

  it("preserves a dirty local snapshot and blocks blind save after an external change", async () => {
    const persistence = createPersistence();
    const harness = createHarness(persistence);

    await act(async () => harness.render("one", "v1"));
    act(() => harness.change("human update"));
    await act(async () => harness.render("agent update", "v2"));

    expect(harness.value()).toBe("human update");
    expect(harness.container.querySelector(".editor-inline-error")?.textContent)
      .toContain("changed outside");

    expect(harness.container.querySelector(".editor-save-chip.error")).toBeNull();
    expect(persistence.persist).not.toHaveBeenCalled();

    await act(async () => harness.conflictAction("Load external version").click());
    expect(harness.value()).toBe("agent update");
    expect(harness.container.querySelector(".editor-inline-error")).toBeNull();
    expect(persistence.persist).not.toHaveBeenCalled();
  });

  it("overwrites only after the user explicitly keeps local content", async () => {
    const persistence = createPersistence();
    const harness = createHarness(persistence);

    await act(async () => harness.render("one", "v1"));
    act(() => harness.change("human update"));
    await act(async () => harness.render("agent update", "v2"));
    await act(async () => harness.conflictAction("Keep local and save").click());

    expect(persistence.persist).toHaveBeenCalledWith(expect.objectContaining({
      content: "human update",
      baseVersion: "v2",
      reason: "manual",
    }));
    expect(harness.value()).toBe("human update");
  });

  it("does not show an external-conflict banner for its own in-flight save echo", async () => {
    const first = deferred<{ version: string }>();
    const second = deferred<{ version: string }>();
    const persistence = {
      kind: "local-fs" as const,
      persist: vi.fn()
        .mockImplementationOnce(() => first.promise)
        .mockImplementationOnce(() => second.promise),
    };
    const harness = createHarness(persistence, "auto");

    await act(async () => harness.render("one", "v1"));
    act(() => harness.change("two"));
    await act(async () => Promise.resolve());
    act(() => harness.change("three"));
    await act(async () => Promise.resolve());

    await act(async () => harness.render("two", "v2"));
    expect(harness.value()).toBe("three");
    expect(harness.container.querySelector(".editor-inline-error")).toBeNull();

    await act(async () => {
      first.resolve({ version: "v2" });
      await Promise.resolve();
    });
    expect(persistence.persist).toHaveBeenLastCalledWith(expect.objectContaining({
      content: "three",
      baseVersion: "v2",
    }));

    await act(async () => {
      second.resolve({ version: "v3" });
      await Promise.resolve();
    });
    expect(harness.container.querySelector(".editor-inline-error")).toBeNull();
  });
});

function createPersistence() {
  return {
    kind: "local-fs" as const,
    persist: vi.fn(async () => ({ version: "saved-version" })),
  };
}

function createHarness(
  persistence: ReturnType<typeof createPersistence>,
  saveMode: "auto" | "manual" = "manual",
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  let change = (_content: string) => undefined;

  return {
    container,
    render(content: string, version: string) {
      root?.render(withTestLocalization(
        <DocumentSessionBoundary
          documentId="notes.txt"
          initialContent="one"
          initialVersion="v1"
          saveMode={saveMode}
          persistence={persistence}
        >
          <TextEditorFrame
            documentId="notes.txt"
            documentVersion={version}
            content={content}
            nodeName="notes.txt"
            defaultMode="live"
            canEdit
            hideSourceView
            renderLive={(value, controls) => {
              change = controls.onChange;
              return <output data-editor-value={value}>{value}</output>;
            }}
          />
        </DocumentSessionBoundary>,
      ));
    },
    change(content: string) {
      change(content);
    },
    value() {
      return container.querySelector("[data-editor-value]")?.getAttribute("data-editor-value");
    },
    conflictAction(label: string) {
      const button = [...container.querySelectorAll<HTMLButtonElement>(".editor-conflict-actions button")]
        .find((candidate) => candidate.textContent === label);
      if (!button) throw new Error(`Missing conflict action: ${label}`);
      return button;
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
