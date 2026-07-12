import { describe, expect, it } from "vitest";
import { parseGitNameStatusPreview } from "../local-api/git/diff-comparison.mjs";

describe("Git comparison preview parser", () => {
  it("maps aggregate diff records, including rename tuples, into sidebar resources", () => {
    expect(parseGitNameStatusPreview(
      "A\0new.md\0M\0existing.ts\0R100\0old.txt\0renamed.txt\0",
      "committed",
      12,
    )).toEqual([
      expect.objectContaining({ path: "new.md", oldPath: null, status: "added", letter: "A" }),
      expect.objectContaining({ path: "existing.ts", oldPath: null, status: "modified", letter: "M" }),
      expect.objectContaining({ path: "renamed.txt", oldPath: "old.txt", status: "renamed", letter: "R" }),
    ]);
  });

  it("bounds resources and rejects an unknown presentation group", () => {
    expect(parseGitNameStatusPreview("A\0one\0A\0two\0", "remote", 1)).toHaveLength(1);
    expect(parseGitNameStatusPreview("R100\0old-only.txt\0", "remote", 12)).toEqual([]);
    expect(() => parseGitNameStatusPreview("", "history", 12)).toThrow(/unsupported/i);
  });
});
