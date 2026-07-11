/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMarkdownLinkGraph,
  createMarkdownLinkGraphIndex,
  type MarkdownLinkGraphDocument,
} from "../vendor/shared-ui/src/editor/markdown/core/links/markdownLinkGraph";
import { MarkdownLinkIndexCoordinator } from "../vendor/shared-ui/src/editor/markdown/core/links/markdownLinkIndexCoordinator";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Markdown link index boundary", () => {
  it("reconstructs the same path resolution and backlinks from a serializable index", () => {
    const documents: MarkdownLinkGraphDocument[] = [
      {
        path: "notes/source.md",
        name: "source.md",
        content: "[Target](../target.md)\n[[target]]\n[Target again](../target.md)",
      },
      { path: "target.md", name: "target.md", content: "# Target" },
    ];
    const metadata = documents.map(({ path, name }) => ({ path, name, content: null }));
    const direct = createMarkdownLinkGraph(documents);
    const indexed = createMarkdownLinkGraph(
      metadata,
      {},
      createMarkdownLinkGraphIndex(documents),
    );

    expect(indexed.indexedDocumentCount).toBe(2);
    expect(indexed.resolveMarkdownLink("notes/source.md", "../target.md"))
      .toEqual(direct.resolveMarkdownLink("notes/source.md", "../target.md"));
    expect(indexed.getBacklinks("target.md")).toEqual(direct.getBacklinks("target.md"));
    expect(indexed.getBacklinks("target.md")[0]).toMatchObject({ count: 3 });
    expect(indexed.getBacklinks("target.md")[0]?.references.map((reference) => reference.lineNumber))
      .toEqual([1, 2, 3]);
  });

  it("cancels a superseded fallback build and commits only the latest revision", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("Worker", undefined);
    const coordinator = new MarkdownLinkIndexCoordinator();
    const first = coordinator.build([
      { path: "a.md", name: "a.md", content: "[b](b.md)" },
      { path: "b.md", name: "b.md", content: "" },
    ]);
    const firstOutcome = first.promise.catch((error: Error) => error);
    const second = coordinator.build([
      { path: "c.md", name: "c.md", content: "[d](d.md)" },
      { path: "d.md", name: "d.md", content: "" },
    ]);

    await vi.runAllTimersAsync();

    expect((await firstOutcome).name).toBe("AbortError");
    expect((await second.promise).indexedDocumentCount).toBe(2);
  });
});
