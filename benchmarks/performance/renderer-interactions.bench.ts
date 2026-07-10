/**
 * @vitest-environment happy-dom
 */
import { createElement, StrictMode } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, bench, describe } from "vitest";
import { ExplorerTree } from "../../vendor/shared-ui/src/data/ExplorerTree";
import { MarkdownCodeMirrorEditor } from "../../vendor/shared-ui/src/editor/markdown/MarkdownCodeMirrorEditor";
import { makeExplorerNodes, makeMarkdown, readRepositoryTextFile } from "./fixtures";

const BENCHMARK_OPTIONS = {
  iterations: 3,
  time: 250,
  warmupIterations: 1,
  warmupTime: 50,
};

const markdownDocuments = new Map(
  [1_000, 3_000, 6_000, 10_000].map((lineCount) => [lineCount, makeMarkdown(lineCount)]),
);
const repositoryArchitectureDocument = readRepositoryTextFile(
  "docs/architecture/editor/markdown/architecture.md",
);
const explorerHarnesses = new Map(
  [100, 250, 500, 1_000].map((rowCount) => [rowCount, createExplorerHarness(rowCount)]),
);

afterAll(() => {
  for (const harness of explorerHarnesses.values()) harness.destroy();
});

describe("Markdown React mount and disposal", () => {
  bench(
    `repository architecture.md · ${repositoryArchitectureDocument.split("\n").length} lines · ${formatBytes(repositoryArchitectureDocument)}`,
    () => {
      mountAndDisposeMarkdownEditor(repositoryArchitectureDocument, false);
    },
    BENCHMARK_OPTIONS,
  );

  for (const lineCount of [1_000, 3_000, 6_000, 10_000]) {
    const source = markdownDocuments.get(lineCount) ?? "";
    bench(`live preview · ${lineCount} lines · ${formatBytes(source)}`, () => {
      mountAndDisposeMarkdownEditor(source, false);
    }, BENCHMARK_OPTIONS);
  }

  const strictModeSource = markdownDocuments.get(6_000) ?? "";
  bench(`development StrictMode · 6000 lines · ${formatBytes(strictModeSource)}`, () => {
    mountAndDisposeMarkdownEditor(strictModeSource, true);
  }, BENCHMARK_OPTIONS);
});

describe("Explorer selection update", () => {
  for (const rowCount of [100, 250, 500, 1_000]) {
    bench(`${rowCount} rendered rows`, () => {
      explorerHarnesses.get(rowCount)?.selectNext();
    }, BENCHMARK_OPTIONS);
  }
});

function mountAndDisposeMarkdownEditor(source: string, strictMode: boolean) {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const root = createRoot(parent);
  const editor = createElement(MarkdownCodeMirrorEditor, {
    value: source,
    readOnly: false,
    livePreview: true,
    documentPath: "bench.md",
  });

  flushSync(() => {
    root.render(strictMode ? createElement(StrictMode, null, editor) : editor);
  });
  flushSync(() => root.unmount());
  parent.remove();
}

type ExplorerHarness = {
  destroy: () => void;
  selectNext: () => void;
};

function createExplorerHarness(rowCount: number): ExplorerHarness {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const root = createRoot(parent);
  const nodes = makeExplorerNodes(rowCount);
  let activeIndex = 0;

  const render = () => {
    const activePath = nodes[activeIndex]?.path ?? null;
    root.render(createElement(ExplorerTree, {
      nodes,
      activePath,
      selectedPaths: new Set(activePath ? [activePath] : []),
      expandedPaths: new Set<string>(),
      showRoot: false,
      onSelectNode: () => undefined,
      renderNodeActions: () => createElement("span", null, "…"),
    }));
  };

  flushSync(render);

  return {
    selectNext() {
      activeIndex = (activeIndex + 1) % Math.max(1, nodes.length);
      flushSync(render);
    },
    destroy() {
      flushSync(() => root.unmount());
      parent.remove();
    },
  };
}

function formatBytes(source: string): string {
  return `${Math.round(Buffer.byteLength(source) / 1024)} KiB`;
}
