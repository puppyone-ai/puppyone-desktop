import { EditorState } from "@codemirror/state";
import { bench, describe } from "vitest";
import {
  markdownCodeMirrorBaseExtensions,
  markdownLivePreviewExtension,
} from "../../vendor/shared-ui/src/editor/markdown/markdownCodeMirrorExtensions";
import { createMarkdownLinkGraph } from "../../vendor/shared-ui/src/editor/markdown/core/links/markdownLinkGraph";
import {
  makeLinkGraphDocuments,
  makeMarkdown,
  readRepositoryMarkdownCorpus,
  readRepositoryTextFile,
} from "./fixtures";

const BENCHMARK_OPTIONS = {
  iterations: 3,
  time: 250,
  warmupIterations: 1,
  warmupTime: 50,
};

const markdownDocuments = new Map(
  [200, 1_000, 3_000, 6_000, 10_000].map((lineCount) => [lineCount, makeMarkdown(lineCount)]),
);
const repositoryCorpus = readRepositoryMarkdownCorpus();
const repositoryArchitectureDocument = readRepositoryTextFile(
  "docs/architecture/editor/markdown/architecture.md",
);
const syntheticLinkCorpora = new Map(
  [20, 100, 300].map((lineCount) => [lineCount, makeLinkGraphDocuments(250, lineCount)]),
);

describe("Markdown EditorState construction", () => {
  bench(
    `repository architecture.md · ${repositoryArchitectureDocument.split("\n").length} lines · ${formatBytes(repositoryArchitectureDocument)}`,
    () => {
      EditorState.create({
        doc: repositoryArchitectureDocument,
        extensions: [
          ...markdownCodeMirrorBaseExtensions(false),
          markdownLivePreviewExtension("safe", null, "docs/architecture/editor/markdown/architecture.md"),
        ],
      });
    },
    BENCHMARK_OPTIONS,
  );

  for (const lineCount of [200, 1_000, 3_000, 6_000, 10_000]) {
    const source = markdownDocuments.get(lineCount) ?? "";

    bench(`source mode · ${lineCount} lines · ${formatBytes(source)}`, () => {
      EditorState.create({
        doc: source,
        extensions: markdownCodeMirrorBaseExtensions(false),
      });
    }, BENCHMARK_OPTIONS);

    bench(`live preview · ${lineCount} lines · ${formatBytes(source)}`, () => {
      EditorState.create({
        doc: source,
        extensions: [
          ...markdownCodeMirrorBaseExtensions(false),
          markdownLivePreviewExtension("safe", null, "bench.md"),
        ],
      });
    }, BENCHMARK_OPTIONS);
  }
});

describe("Markdown link graph construction", () => {
  bench(
    `repository corpus · ${repositoryCorpus.length} documents · ${formatCorpusBytes(repositoryCorpus)}`,
    () => {
      createMarkdownLinkGraph(repositoryCorpus);
    },
    BENCHMARK_OPTIONS,
  );

  for (const linesPerDocument of [20, 100, 300]) {
    const corpus = syntheticLinkCorpora.get(linesPerDocument) ?? [];
    bench(
      `link-heavy · 250 documents × ${linesPerDocument} lines · ${formatCorpusBytes(corpus)}`,
      () => {
        createMarkdownLinkGraph(corpus);
      },
      BENCHMARK_OPTIONS,
    );
  }
});

function formatBytes(source: string): string {
  return `${Math.round(Buffer.byteLength(source) / 1024)} KiB`;
}

function formatCorpusBytes(documents: readonly { content?: string | null }[]): string {
  const bytes = documents.reduce(
    (total, document) => total + Buffer.byteLength(document.content ?? ""),
    0,
  );
  return `${Math.round(bytes / 1024)} KiB`;
}
