import {
  createMarkdownLinkGraphIndex,
  type MarkdownLinkGraphDocument,
  type MarkdownLinkGraphIndexSnapshot,
} from "./markdownLinkGraph";

export type MarkdownLinkIndexWorkerRequest = {
  requestId: number;
  documents: MarkdownLinkGraphDocument[];
};

export type MarkdownLinkIndexWorkerResponse = {
  requestId: number;
  index?: MarkdownLinkGraphIndexSnapshot;
  error?: string;
};

type WorkerScope = {
  onmessage: ((event: MessageEvent<MarkdownLinkIndexWorkerRequest>) => void) | null;
  postMessage(message: MarkdownLinkIndexWorkerResponse): void;
};

const workerScope = self as unknown as WorkerScope;

workerScope.onmessage = (event) => {
  const { requestId, documents } = event.data;
  try {
    workerScope.postMessage({
      requestId,
      index: createMarkdownLinkGraphIndex(documents),
    });
  } catch (error) {
    workerScope.postMessage({
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
