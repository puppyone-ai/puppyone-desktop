import { useEffect, useMemo } from "react";
import { EditorView } from "@codemirror/view";
import type {
  DataNode,
  DataPort,
  RendererPerformanceSummary,
  Workspace,
} from "@puppyone/shared-ui";
import {
  DataWorkspace,
  getRendererPerformanceTracker,
  MarkdownLinkIndexCoordinator,
} from "@puppyone/shared-ui";

const SAMPLE_COUNT = readSampleTarget();
const COLD_FIRST_OPEN = readBooleanParameter("rendererPerformanceCold");
const ENABLE_LINK_INDEX = readBooleanParameter("rendererPerformanceLinkIndex");
const WARMUP_COUNT = COLD_FIRST_OPEN ? 0 : 4;
const FILE_A = "performance-a.md";
const FILE_B = "performance-b.md";

declare global {
  interface Window {
    __PUPPYONE_RENDERER_PERFORMANCE_SMOKE_RESULT__?: RendererPerformanceSummary | {
      error: string;
    };
  }
}

export function RendererPerformanceSmokeHarness() {
  const nodes = useMemo(() => makeExplorerNodes(1_000), []);
  const source = useMemo(() => makeMarkdown(10_000), []);
  const workspace = useMemo<Workspace>(() => ({
    id: "renderer-performance-smoke",
    name: "Renderer performance smoke",
    path: "/performance-smoke",
    status: "recording",
  }), []);
  const dataPort = useMemo<DataPort>(() => ({
    listChildren: async (folderPath) => folderPath ? [] : nodes,
    readFile: async (path, options) => {
      await nextTask(options?.signal);
      options?.signal?.throwIfAborted();
      return {
        path,
        name: path,
        type: "markdown",
        content: source,
      };
    },
  }), [nodes, source]);

  useEffect(() => {
    const tracker = getRendererPerformanceTracker();
    tracker.reset();
    let stopped = false;
    let nextFile = FILE_A;
    let warmupSamples = 0;
    let measuring = WARMUP_COUNT === 0;
    let timeoutId: number | null = null;

    const finish = () => {
      if (stopped) return;
      stopped = true;
      window.setTimeout(runWorkerSelfCheck, ENABLE_LINK_INDEX ? 1_500 : 0);
    };

    const runWorkerSelfCheck = () => {
      const coordinator = new MarkdownLinkIndexCoordinator();
      const workerStartedAt = performance.now();
      const request = coordinator.build([
        { path: "worker-source.md", name: "worker-source.md", content: "[target](worker-target.md)" },
        { path: "worker-target.md", name: "worker-target.md", content: "# Target" },
      ]);
      void request.promise.then((index) => {
        if (index.indexedDocumentCount !== 2 || index.backlinks.length !== 1) {
          throw new Error("Markdown link index worker returned an invalid snapshot.");
        }
        tracker.recordOperation("markdown_link_worker_roundtrip", performance.now() - workerStartedAt);
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            window.__PUPPYONE_RENDERER_PERFORMANCE_SMOKE_RESULT__ = tracker.getSummary();
          });
        });
      }).catch((error) => {
        window.__PUPPYONE_RENDERER_PERFORMANCE_SMOKE_RESULT__ = {
          error: error instanceof Error ? error.message : String(error),
        };
      });
    };

    const selectNextFile = () => {
      if (stopped) return;
      const button = document.querySelector<HTMLButtonElement>(
        `[data-explorer-path="${nextFile}"]`,
      );
      if (!button) {
        window.requestAnimationFrame(selectNextFile);
        return;
      }
      nextFile = nextFile === FILE_A ? FILE_B : FILE_A;
      button.click();
    };

    const failPresentationContract = (message: string) => {
      if (stopped) return;
      stopped = true;
      window.__PUPPYONE_RENDERER_PERFORMANCE_SMOKE_RESULT__ = { error: message };
    };

    const verifyPendingPresentation = () => {
      const host = document.querySelector<HTMLElement>(".markdown-codemirror-editor");
      const editor = host?.querySelector<HTMLElement>(".cm-editor") ?? null;
      if (!host || !editor) {
        failPresentationContract("Markdown base readiness did not expose an EditorView for presentation verification.");
        return false;
      }
      if (host.dataset.livePreview !== "true" || host.dataset.previewState !== "pending") {
        failPresentationContract(`Markdown source exposure gate was not pending at base readiness (${host.dataset.previewState ?? "missing"}).`);
        return false;
      }
      if (getComputedStyle(editor).visibility !== "hidden") {
        failPresentationContract("Markdown canonical source was visible before Live Preview committed.");
        return false;
      }
      return true;
    };

    const verifyReadyPresentation = () => {
      const host = document.querySelector<HTMLElement>(".markdown-codemirror-editor");
      const editor = host?.querySelector<HTMLElement>(".cm-editor") ?? null;
      if (!host || !editor) {
        failPresentationContract("Markdown preview readiness did not retain an EditorView.");
        return false;
      }
      if (host.dataset.previewState !== "ready") {
        failPresentationContract(`Markdown preview did not atomically commit (${host.dataset.previewState ?? "missing"}).`);
        return false;
      }
      if (getComputedStyle(editor).visibility === "hidden") {
        failPresentationContract("Markdown Live Preview remained hidden after readiness committed.");
        return false;
      }
      return true;
    };

    const onPerformance = (event: Event) => {
      const detail = (event as CustomEvent<{ stage?: string }>).detail;
      if (detail?.stage === "editor_base_ready" && !verifyPendingPresentation()) return;
      if (detail?.stage !== "preview_ready") return;
      window.requestAnimationFrame(() => {
        if (stopped || !verifyReadyPresentation()) return;
        if (!measuring) {
          warmupSamples += 1;
          if (warmupSamples >= WARMUP_COUNT) {
            tracker.reset();
            measuring = true;
          }
          window.requestAnimationFrame(selectNextFile);
          return;
        }
        const editorElement = document.querySelector<HTMLElement>(".markdown-codemirror-editor");
        const editorView = editorElement ? EditorView.findFromDOM(editorElement) : null;
        if (!editorView) {
          failPresentationContract("Unable to resolve the CodeMirror view for input transaction sampling.");
          return;
        }
        editorView.dispatch({ changes: { from: 0, insert: "x" } });
        const summary = tracker.getSummary();
        if (summary.completedSamples >= SAMPLE_COUNT) {
          finish();
          return;
        }
        window.requestAnimationFrame(selectNextFile);
      });
    };

    window.addEventListener("puppyone:renderer-performance", onPerformance);
    window.requestAnimationFrame(selectNextFile);
    timeoutId = window.setTimeout(() => {
      if (stopped) return;
      stopped = true;
      window.__PUPPYONE_RENDERER_PERFORMANCE_SMOKE_RESULT__ = {
        error: `Renderer performance smoke timed out after ${tracker.getSummary().completedSamples} samples.`,
      };
    }, 60_000);

    return () => {
      stopped = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      window.removeEventListener("puppyone:renderer-performance", onPerformance);
    };
  }, []);

  return (
    <div style={{ width: "1280px", height: "800px" }}>
      <DataWorkspace
        workspace={workspace}
        dataPort={dataPort}
        showHeader={false}
        showExplorerRoot={false}
        showExplorerToolbar={false}
        showPreviewHeader={false}
        hidePreviewSourceView
        editorSaveMode="manual"
        defaultExplorerWidth={320}
        enableMarkdownLinkContentIndexing={ENABLE_LINK_INDEX}
      />
    </div>
  );
}

function makeExplorerNodes(count: number): DataNode[] {
  return Array.from({ length: count }, (_, index) => {
    const path = index === 0 ? FILE_A : index === 1 ? FILE_B : `document-${index}.md`;
    return {
      id: path,
      name: path,
      path,
      type: "markdown" as const,
    };
  });
}

function makeMarkdown(lineCount: number): string {
  const lines: string[] = [];
  for (let index = 0; index < lineCount; index += 1) {
    if (index % 100 === 0) lines.push(`# Heading ${index}`);
    else if (index % 43 === 0) lines.push(`| row ${index} | **value** |`);
    else lines.push(`Paragraph ${index} with **bold**, _emphasis_, and [link](note-${index % 30}.md).`);
  }
  return lines.join("\n");
}

function nextTask(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timeoutId = window.setTimeout(resolve, 0);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timeoutId);
      reject(signal.reason);
    }, { once: true });
  });
}

function readSampleTarget(): number {
  const requested = Number.parseInt(
    new URLSearchParams(window.location.search).get("rendererPerformanceSamples") ?? "",
    10,
  );
  return Number.isFinite(requested) && requested > 0 ? requested : 30;
}

function readBooleanParameter(name: string): boolean {
  return new URLSearchParams(window.location.search).get(name) === "true";
}
