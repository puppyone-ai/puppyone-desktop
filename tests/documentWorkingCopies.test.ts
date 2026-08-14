import { describe, expect, it, vi } from "vitest";
import type { DocumentPersistencePort } from "@puppyone/shared-ui";
import {
  closeDocumentWorkingCopy,
  getOrCreateDocumentWorkingCopy,
} from "../packages/shared-ui/src/editor/document-session/documentWorkingCopies";

describe("document Working Copy registry", () => {
  it("keeps one session per persistence identity and document until explicit close", async () => {
    const persistence: DocumentPersistencePort = {
      kind: "local-fs",
      persist: vi.fn(async () => ({ version: "v2" })),
    };
    const first = getOrCreateDocumentWorkingCopy({
      documentId: "working-copy-a.md",
      initialContent: "a",
      saveMode: "auto",
      persistence,
    });
    const second = getOrCreateDocumentWorkingCopy({
      documentId: "working-copy-a.md",
      initialContent: "stale render content",
      saveMode: "auto",
      persistence,
    });

    expect(second.session).toBe(first.session);
    await closeDocumentWorkingCopy("working-copy-a.md");

    const reopened = getOrCreateDocumentWorkingCopy({
      documentId: "working-copy-a.md",
      initialContent: "a",
      saveMode: "auto",
      persistence,
    });
    expect(reopened.session).not.toBe(first.session);
    await closeDocumentWorkingCopy("working-copy-a.md");
  });
});
