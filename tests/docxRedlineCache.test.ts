import { describe, expect, it, vi } from "vitest";
import type { GitRevisionPair } from "../src/types/electron";
import {
  BoundedLruCache,
  createDocxRedlineCacheKey,
} from "../src/features/source-control/diff/docx/docxRedlineCache";
import { loadDocxRedline } from "../src/features/source-control/diff/docx/docxRedlineProvider";
import type { DocxRedlinePresentation } from "../src/features/source-control/diff/docx/docxRedlineTypes";

describe("DOCX redline cache", () => {
  it("is bounded and promotes recently read entries", () => {
    const cache = new BoundedLruCache<number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.get("a")).toBe(1);
    cache.set("c", 3);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    expect(cache.get("c")).toBe(3);
  });

  it("invalidates keys when either identity or renderer version changes", () => {
    const pair = revisionPair();
    expect(createDocxRedlineCacheKey(pair, "1")).not.toBe(createDocxRedlineCacheKey({
      ...pair,
      after: { ...pair.after, identity: "after:2" },
    }, "1"));
    expect(createDocxRedlineCacheKey(pair, "1")).not.toBe(createDocxRedlineCacheKey(pair, "2"));
  });

  it("reuses a successful model and never caches failures", async () => {
    const pair = revisionPair();
    const memory = new Map<string, DocxRedlinePresentation>();
    const readResource = vi.fn(async () => new ArrayBuffer(4));
    const model = presentation();
    const build = vi.fn(async () => model);
    const dependencies = {
      readResource,
      build,
      readCache: (key: string) => memory.get(key),
      writeCache: (key: string, value: DocxRedlinePresentation) => memory.set(key, value),
    };

    await loadDocxRedline(pair, new AbortController().signal, dependencies);
    await loadDocxRedline(pair, new AbortController().signal, dependencies);
    expect(build).toHaveBeenCalledOnce();
    expect(readResource).toHaveBeenCalledTimes(2);

    memory.clear();
    build.mockRejectedValueOnce(new Error("bad package"));
    await expect(loadDocxRedline(pair, new AbortController().signal, dependencies)).rejects.toThrow("bad package");
    expect(memory.size).toBe(0);
  });
});

function revisionPair(): GitRevisionPair {
  return {
    repositoryIdentity: "repo:1",
    selectionIdentity: "selection:1",
    sessionId: "git-diff-session:test",
    scope: "unstaged",
    path: "report.docx",
    oldPath: null,
    status: "modified",
    before: { kind: "resource", identity: "before:1", size: 4, mimeType: "application/docx", handle: "b" },
    after: { kind: "resource", identity: "after:1", size: 4, mimeType: "application/docx", handle: "a" },
  };
}

function presentation(): DocxRedlinePresentation {
  return {
    kind: "docx-redline",
    rendererVersion: "1",
    state: "empty",
    stats: {
      blocksAdded: 0,
      blocksDeleted: 0,
      blocksModified: 0,
      blocksChanged: 0,
      wordsAdded: 0,
      wordsDeleted: 0,
    },
    changes: [],
    truncated: false,
    fidelityNote: "test",
  };
}
