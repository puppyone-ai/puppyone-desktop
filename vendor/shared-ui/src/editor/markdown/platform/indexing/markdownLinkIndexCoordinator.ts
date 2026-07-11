import {
  createMarkdownLinkGraphIndexer,
  type MarkdownLinkGraphDocument,
  type MarkdownLinkGraphIndexer,
  type MarkdownLinkGraphIndexSnapshot,
} from "../../core/links/markdownLinkGraph";
import type {
  MarkdownLinkIndexWorkerRequest,
  MarkdownLinkIndexWorkerResponse,
} from "./markdownLinkIndexProtocol";

export type MarkdownLinkIndexDocumentReader = (
  path: string,
  signal: AbortSignal,
) => Promise<MarkdownLinkGraphDocument | null>;

export type MarkdownLinkIndexRequest = {
  revision: number;
  promise: Promise<MarkdownLinkGraphIndexSnapshot>;
  cancel(): void;
};

type PendingOperation = {
  resolve(response: MarkdownLinkIndexWorkerResponse): void;
  reject(error: Error): void;
};

type WorkerRequestPayload = MarkdownLinkIndexWorkerRequest extends infer Request
  ? Request extends MarkdownLinkIndexWorkerRequest
    ? Omit<Request, "requestId" | "operationId">
    : never
  : never;

type ActiveSession = {
  revision: number;
  controller: AbortController;
  worker: Worker | null;
  fallbackIndexer: MarkdownLinkGraphIndexer | null;
  pending: Map<number, PendingOperation>;
  operationSequence: number;
  initialized: Promise<void>;
  updateChain: Promise<MarkdownLinkGraphIndexSnapshot>;
  failure: Error | null;
};

/**
 * Streams one document at a time through a revision-bound Worker. Full source
 * is never accumulated in React state or cloned as one workspace-sized
 * message. The Worker retains only compact derived backlinks and remains alive
 * for single-document updates after saves.
 */
export class MarkdownLinkIndexCoordinator {
  private revision = 0;
  private current: ActiveSession | null = null;

  build(documents: readonly MarkdownLinkGraphDocument[]): MarkdownLinkIndexRequest {
    const byPath = new Map(documents.map((document) => [document.path, document]));
    return this.buildFromReader(
      documents.map(({ path, name }) => ({ path, name, content: null })),
      documents
        .filter((document) => typeof document.content === "string")
        .map((document) => document.path),
      async (path) => byPath.get(path) ?? null,
    );
  }

  buildFromReader(
    metadataDocuments: readonly MarkdownLinkGraphDocument[],
    sourcePaths: readonly string[],
    readDocument: MarkdownLinkIndexDocumentReader,
  ): MarkdownLinkIndexRequest {
    this.cancel();
    const revision = ++this.revision;
    const session = this.createSession(revision, metadataDocuments);
    this.current = session;

    const promise = this.runInitialBuild(session, sourcePaths, readDocument);
    session.updateChain = promise;

    return {
      revision,
      promise,
      cancel: () => {
        if (this.current?.revision === revision) this.cancel();
      },
    };
  }

  updateDocument(document: MarkdownLinkGraphDocument): Promise<MarkdownLinkGraphIndexSnapshot> {
    const session = this.current;
    if (!session) return Promise.reject(createAbortError());
    session.updateChain = session.updateChain.then(async () => {
      this.assertCurrent(session);
      await scheduleBackgroundTurn(session.controller.signal);
      await this.indexDocument(session, document);
      return this.readSnapshot(session);
    });
    return session.updateChain;
  }

  cancel() {
    const session = this.current;
    this.current = null;
    this.revision += 1;
    if (!session) return;
    session.controller.abort(createAbortError());
    session.worker?.terminate();
    session.worker = null;
    const error = createAbortError();
    for (const pending of session.pending.values()) pending.reject(error);
    session.pending.clear();
  }

  private createSession(
    revision: number,
    metadataDocuments: readonly MarkdownLinkGraphDocument[],
  ): ActiveSession {
    const controller = new AbortController();
    const session: ActiveSession = {
      revision,
      controller,
      worker: null,
      fallbackIndexer: null,
      pending: new Map(),
      operationSequence: 0,
      initialized: Promise.resolve(),
      updateChain: Promise.resolve({ indexedDocumentCount: 0, backlinks: [] }),
      failure: null,
    };

    if (typeof Worker === "function") {
      try {
        const worker = new Worker(
          new URL("./markdownLinkIndex.worker.ts", import.meta.url),
          { type: "module", name: "puppyone-markdown-link-index" },
        );
        session.worker = worker;
        worker.onmessage = (event: MessageEvent<MarkdownLinkIndexWorkerResponse>) => {
          const response = event.data;
          if (response.requestId !== session.revision) return;
          const pending = session.pending.get(response.operationId);
          if (!pending) return;
          session.pending.delete(response.operationId);
          if (response.type === "error") {
            pending.reject(new Error(response.error ?? "Markdown link indexing failed."));
          } else {
            pending.resolve(response);
          }
        };
        worker.onerror = (event) => {
          const error = new Error(event.message || "Markdown link indexing worker failed.");
          session.failure = error;
          worker.terminate();
          session.worker = null;
          for (const pending of session.pending.values()) pending.reject(error);
          session.pending.clear();
        };
      } catch {
        session.worker = null;
        session.fallbackIndexer = createMarkdownLinkGraphIndexer(metadataDocuments);
      }
    } else {
      session.fallbackIndexer = createMarkdownLinkGraphIndexer(metadataDocuments);
    }

    if (session.worker) {
      session.initialized = this.send(session, {
        type: "initialize",
        documents: [...metadataDocuments],
      }).then(() => undefined);
    }
    return session;
  }

  private async runInitialBuild(
    session: ActiveSession,
    sourcePaths: readonly string[],
    readDocument: MarkdownLinkIndexDocumentReader,
  ): Promise<MarkdownLinkGraphIndexSnapshot> {
    await session.initialized;
    for (const path of sourcePaths) {
      this.assertCurrent(session);
      await scheduleBackgroundTurn(session.controller.signal);
      let document: MarkdownLinkGraphDocument | null = null;
      try {
        document = await readDocument(path, session.controller.signal);
      } catch (error) {
        if (session.controller.signal.aborted) throw createAbortError();
        continue;
      }
      if (!document || typeof document.content !== "string") continue;
      await this.indexDocument(session, document);
    }
    return this.readSnapshot(session);
  }

  private async indexDocument(session: ActiveSession, document: MarkdownLinkGraphDocument) {
    await this.send(session, { type: "index-document", document });
  }

  private async readSnapshot(session: ActiveSession): Promise<MarkdownLinkGraphIndexSnapshot> {
    const response = await this.send(session, { type: "snapshot" });
    if (!response.index) throw new Error("Markdown link index Worker returned no snapshot.");
    return response.index;
  }

  private send(
    session: ActiveSession,
    request: WorkerRequestPayload,
  ): Promise<MarkdownLinkIndexWorkerResponse> {
    this.assertCurrentOrInitializing(session);
    if (session.failure) return Promise.reject(session.failure);
    const operationId = ++session.operationSequence;
    const message = {
      ...request,
      requestId: session.revision,
      operationId,
    } as MarkdownLinkIndexWorkerRequest;

    if (session.fallbackIndexer) {
      return new Promise((resolve, reject) => {
        window.setTimeout(() => {
          try {
            this.assertCurrent(session);
            if (message.type === "index-document") {
              session.fallbackIndexer?.indexDocument(message.document);
              resolve({ requestId: session.revision, operationId, type: "ack" });
            } else if (message.type === "snapshot") {
              resolve({
                requestId: session.revision,
                operationId,
                type: "snapshot",
                index: session.fallbackIndexer?.createSnapshot(),
              });
            } else {
              resolve({ requestId: session.revision, operationId, type: "ack" });
            }
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        }, 0);
      });
    }

    if (!session.worker) {
      return Promise.reject(new Error("Markdown link index Worker is unavailable."));
    }

    return new Promise((resolve, reject) => {
      session.pending.set(operationId, { resolve, reject });
      try {
        session.worker?.postMessage(message);
      } catch (error) {
        session.pending.delete(operationId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private assertCurrent(session: ActiveSession) {
    if (
      this.current !== session
      || session.revision !== this.revision
      || session.controller.signal.aborted
    ) {
      throw createAbortError();
    }
  }

  private assertCurrentOrInitializing(session: ActiveSession) {
    if (session.controller.signal.aborted) throw createAbortError();
  }
}

function scheduleBackgroundTurn(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(createAbortError());
      return;
    }

    let timeoutId: number | null = null;
    let idleId: number | null = null;
    const finish = () => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    };
    const onAbort = () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (idleId !== null) window.cancelIdleCallback(idleId);
      reject(createAbortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });

    if (typeof window.requestIdleCallback === "function") {
      // Idle callbacks run after rendering opportunities. This prevents a
      // stream of tiny background tasks from starving the preview-ready frame.
      idleId = window.requestIdleCallback(finish, { timeout: 250 });
    } else {
      // One frame-sized delay is a conservative fallback for test/older hosts.
      timeoutId = window.setTimeout(finish, 16);
    }
  });
}

function createAbortError(): Error {
  if (typeof DOMException === "function") {
    return new DOMException("Superseded Markdown link index", "AbortError");
  }
  const error = new Error("Superseded Markdown link index");
  error.name = "AbortError";
  return error;
}
