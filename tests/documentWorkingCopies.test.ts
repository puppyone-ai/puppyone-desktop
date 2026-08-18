import { describe, expect, it, vi } from "vitest";
import type { DocumentPersistencePort } from "@puppyone/shared-ui";
import {
  closeDocumentWorkingCopy,
  getOrCreateDocumentWorkingCopy,
} from "../packages/shared-ui/src/editor/document-session/documentWorkingCopies";

describe("document Working Copy registry", () => {
  it("keeps one session per stable storage identity and document across adapter recreation", async () => {
    const firstPersistence: DocumentPersistencePort = {
      kind: "local-fs",
      storageIdentity: "test:working-copies",
      persist: vi.fn(async () => ({ ok: true, version: "v2" })),
    };
    const recreatedPersistence: DocumentPersistencePort = {
      kind: "local-fs",
      storageIdentity: "test:working-copies",
      persist: vi.fn(async () => ({ ok: true, version: "v3" })),
    };
    const first = getOrCreateDocumentWorkingCopy({
      documentId: "working-copy-a.md",
      initialContent: "a",
      saveMode: "auto",
      persistence: firstPersistence,
    });
    const second = getOrCreateDocumentWorkingCopy({
      documentId: "working-copy-a.md",
      initialContent: "stale render content",
      saveMode: "auto",
      persistence: recreatedPersistence,
    });

    expect(second.session).toBe(first.session);
    await closeDocumentWorkingCopy({
      storageIdentity: "test:working-copies",
      resourcePath: "working-copy-a.md",
    });

    const reopened = getOrCreateDocumentWorkingCopy({
      documentId: "working-copy-a.md",
      initialContent: "a",
      saveMode: "auto",
      persistence: firstPersistence,
    });
    expect(reopened.session).not.toBe(first.session);
    await closeDocumentWorkingCopy({
      storageIdentity: "test:working-copies",
      resourcePath: "working-copy-a.md",
    });
  });

  it("keeps equal resource paths isolated across storage identities", async () => {
    const first = getOrCreateDocumentWorkingCopy({
      documentId: "same.md",
      initialContent: "first",
      saveMode: "auto",
      persistence: {
        kind: "local-fs",
        storageIdentity: "test:workspace-a",
        persist: vi.fn(async () => ({ ok: true, version: "a2" })),
      },
    });
    const second = getOrCreateDocumentWorkingCopy({
      documentId: "same.md",
      initialContent: "second",
      saveMode: "auto",
      persistence: {
        kind: "local-fs",
        storageIdentity: "test:workspace-b",
        persist: vi.fn(async () => ({ ok: true, version: "b2" })),
      },
    });

    expect(second.session).not.toBe(first.session);
    await closeDocumentWorkingCopy({ storageIdentity: "test:workspace-a", resourcePath: "same.md" });
    await closeDocumentWorkingCopy({ storageIdentity: "test:workspace-b", resourcePath: "same.md" });
  });
});
