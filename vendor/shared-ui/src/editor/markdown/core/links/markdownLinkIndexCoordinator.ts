import {
  createMarkdownLinkGraphIndex,
  type MarkdownLinkGraphDocument,
  type MarkdownLinkGraphIndexSnapshot,
} from "./markdownLinkGraph";
import type {
  MarkdownLinkIndexWorkerRequest,
  MarkdownLinkIndexWorkerResponse,
} from "./markdownLinkIndex.worker";

export type MarkdownLinkIndexRequest = {
  revision: number;
  promise: Promise<MarkdownLinkGraphIndexSnapshot>;
  cancel(): void;
};

/**
 * One in-flight, revision-bound pure-data index build. Superseding a request
 * terminates its worker, so stale documents cannot consume CPU or commit.
 */
export class MarkdownLinkIndexCoordinator {
  private revision = 0;
  private worker: Worker | null = null;
  private fallbackTimer: number | null = null;
  private rejectCurrent: ((reason: Error) => void) | null = null;

  build(documents: readonly MarkdownLinkGraphDocument[]): MarkdownLinkIndexRequest {
    this.cancel();
    const revision = ++this.revision;
    let cancelled = false;

    const promise = typeof Worker === "function"
      ? new Promise<MarkdownLinkGraphIndexSnapshot>((resolve, reject) => {
          this.rejectCurrent = reject;
          const worker = new Worker(
            new URL("./markdownLinkIndex.worker.ts", import.meta.url),
            { type: "module", name: "puppyone-markdown-link-index" },
          );
          this.worker = worker;
          worker.onmessage = (event: MessageEvent<MarkdownLinkIndexWorkerResponse>) => {
            if (cancelled || revision !== this.revision || event.data.requestId !== revision) return;
            this.worker = null;
            this.rejectCurrent = null;
            worker.terminate();
            if (event.data.index) resolve(event.data.index);
            else reject(new Error(event.data.error ?? "Markdown link indexing failed."));
          };
          worker.onerror = (event) => {
            if (cancelled || revision !== this.revision) return;
            this.worker = null;
            this.rejectCurrent = null;
            worker.terminate();
            reject(new Error(event.message || "Markdown link indexing worker failed."));
          };
          const request: MarkdownLinkIndexWorkerRequest = {
            requestId: revision,
            documents: [...documents],
          };
          worker.postMessage(request);
        })
      : new Promise<MarkdownLinkGraphIndexSnapshot>((resolve, reject) => {
          this.rejectCurrent = reject;
          // Browser-less test environments retain functional behavior without
          // putting synchronous work back into the initiating React render.
          this.fallbackTimer = window.setTimeout(() => {
            this.fallbackTimer = null;
            if (cancelled || revision !== this.revision) return;
            try {
              this.rejectCurrent = null;
              resolve(createMarkdownLinkGraphIndex(documents));
            } catch (error) {
              this.rejectCurrent = null;
              reject(error);
            }
          }, 0);
        });

    return {
      revision,
      promise,
      cancel: () => {
        if (cancelled) return;
        cancelled = true;
        if (revision === this.revision) this.cancel();
      },
    };
  }

  cancel() {
    this.revision += 1;
    const reject = this.rejectCurrent;
    this.rejectCurrent = null;
    this.worker?.terminate();
    this.worker = null;
    if (this.fallbackTimer !== null) {
      window.clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
    reject?.(createAbortError());
  }
}

function createAbortError(): Error {
  if (typeof DOMException === "function") {
    return new DOMException("Superseded Markdown link index", "AbortError");
  }
  const error = new Error("Superseded Markdown link index");
  error.name = "AbortError";
  return error;
}
