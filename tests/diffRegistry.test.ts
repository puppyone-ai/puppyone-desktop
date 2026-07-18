import { describe, expect, it } from "vitest";
import { getBinaryDiffSummary, resolveGitDiffPresentation } from "../src/features/source-control/diffRegistry";
import type { GitFileDiff } from "../src/types/electron";

function file(overrides: Partial<GitFileDiff>): GitFileDiff {
  return {
    path: "notes.md",
    oldPath: null,
    status: "modified",
    additions: 1,
    deletions: 0,
    binary: false,
    lines: [],
    ...overrides,
  };
}

describe("Git diff registry", () => {
  it("uses canonical format recognition and the unified renderer for text patches", () => {
    expect(resolveGitDiffPresentation(file({ path: "notes.md" }))).toMatchObject({
      id: "text-unified",
      source: "git-patch",
      format: { id: "markdown" },
    });
  });

  it("always gives binary files an honest metadata fallback", () => {
    const presentation = resolveGitDiffPresentation(file({
      path: "diagram.unknown-binary",
      binary: true,
      status: "added",
    }));
    expect(presentation).toMatchObject({ id: "binary-summary", source: "metadata" });
    expect(getBinaryDiffSummary(file({ path: "diagram.unknown-binary", binary: true, status: "added" }), presentation.format))
      .toContain("Open the file");
  });

  it("does not advertise DOCX redline until an authorized revision pair is available", () => {
    expect(resolveGitDiffPresentation(file({ path: "contract.docx", binary: true }))).toMatchObject({
      id: "binary-summary",
      source: "metadata",
      format: { id: "docx" },
    });
  });
});
