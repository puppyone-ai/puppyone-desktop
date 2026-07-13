/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentEditingSession } from "../packages/shared-ui/src/editor/document-session/DocumentEditingSession";
import { PuppyFlowEditor } from "../src/features/puppyflow/PuppyFlowEditor";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("PuppyFlow Document Session integration", () => {
  it("preserves an invalid source verbatim until the user performs an edit", async () => {
    const persist = vi.fn(async () => ({ version: "v2" }));
    const source = "{ invalid puppyflow source";
    const session = new DocumentEditingSession({
      documentId: "workflow.puppyflow",
      initialContent: source,
      initialVersion: "v1",
      saveMode: "manual",
      persistence: {
        kind: "local-fs",
        policy: { idleDelayMs: 350, maxDelayMs: 2000 },
        persist,
      },
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => root?.render(
      <PuppyFlowEditor
        node={{
          id: "workflow.puppyflow",
          path: "workflow.puppyflow",
          name: "workflow.puppyflow",
          type: "workflow",
        }}
        fileContent={{
          path: "workflow.puppyflow",
          name: "workflow.puppyflow",
          type: "workflow",
          content: source,
          version: "v1",
        }}
        documentSession={session}
      />,
    ));

    expect(container.textContent).toContain("Unable to parse this PuppyFlow file");
    act(() => root?.unmount());
    root = null;
    await Promise.resolve();

    expect(persist).not.toHaveBeenCalled();
    expect(session.getPersistedContent()).toBe(source);
  });
});
