/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentSessionBoundary } from "../packages/shared-ui/src/editor/document-session/DocumentSessionBoundary";
import type {
  DocumentPersistedCommit,
  EditorDocumentSession,
} from "../packages/shared-ui/src/editor/document-session/types";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("DocumentSessionBoundary", () => {
  it("routes a late acknowledgement to the callback owned by the original document", async () => {
    const write = deferred<{ version: string }>();
    const persistence = {
      kind: "local-fs" as const,
      policy: { idleDelayMs: 100, maxDelayMs: 500 },
      persist: vi.fn(() => write.promise),
    };
    const onPersistedA = vi.fn<(commit: DocumentPersistedCommit) => void>();
    const onPersistedB = vi.fn<(commit: DocumentPersistedCommit) => void>();
    let currentSession: EditorDocumentSession | null = null;
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const renderDocument = (
      documentId: string,
      onPersisted: (commit: DocumentPersistedCommit) => void,
    ) => {
      root?.render(
        <DocumentSessionBoundary
          documentId={documentId}
          initialContent="base"
          initialVersion="v1"
          saveMode="auto"
          persistence={persistence}
          onPersisted={onPersisted}
        >
          {(session) => {
            currentSession = session;
            return null;
          }}
        </DocumentSessionBoundary>,
      );
    };

    act(() => renderDocument("a.md", onPersistedA));
    const sessionA = currentSession;
    expect(sessionA).not.toBeNull();
    const flushA = sessionA!.flushSnapshot(
      { revision: "a:r2", content: "updated A" },
      "document-switch",
    );

    act(() => renderDocument("b.md", onPersistedB));
    expect(currentSession?.documentId).toBe("b.md");

    write.resolve({ version: "v2" });
    await act(async () => flushA);

    expect(onPersistedA).toHaveBeenCalledWith(expect.objectContaining({
      documentId: "a.md",
      content: "updated A",
      version: "v2",
    }));
    expect(onPersistedB).not.toHaveBeenCalled();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
