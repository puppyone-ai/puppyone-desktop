import type { DocxRedlinePresentation } from "../model";
import type { DocxRedlineWorkerRequest, DocxRedlineWorkerResponse } from "./task";

export const DOCX_REDLINE_WORKER_TIMEOUT_MS = 20_000;

export function buildDocxRedlineInWorker(
  before: ArrayBuffer | null,
  after: ArrayBuffer | null,
  signal?: AbortSignal,
  timeoutMs = DOCX_REDLINE_WORKER_TIMEOUT_MS,
): Promise<DocxRedlinePresentation> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      reject(new RangeError("DOCX redline worker timeout must be positive."));
      return;
    }

    const worker = new Worker(
      new URL("./docxRedline.worker.ts", import.meta.url),
      { type: "module", name: "puppyone-docx-redline" },
    );
    let settled = false;
    const cleanup = () => {
      signal?.removeEventListener("abort", handleAbort);
      clearTimeout(timeout);
      worker.terminate();
    };
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const handleAbort = () => settle(() => reject(abortError()));
    const timeout = setTimeout(() => {
      settle(() => reject(new DOMException(
        `Word diff exceeded the ${Math.round(timeoutMs)} ms processing limit.`,
        "TimeoutError",
      )));
    }, timeoutMs);

    worker.onmessage = (event: MessageEvent<DocxRedlineWorkerResponse>) => {
      settle(() => {
        if (event.data.ok) resolve(event.data.model);
        else reject(deserializeWorkerError(event.data.error));
      });
    };
    worker.onerror = (event) => settle(() => reject(new Error(event.message || "Word diff worker failed.")));
    worker.onmessageerror = () => settle(() => reject(new Error("Word diff worker returned unreadable data.")));
    signal?.addEventListener("abort", handleAbort, { once: true });

    const request: DocxRedlineWorkerRequest = { before, after };
    const transfer = [before, after].filter((buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer);
    try {
      worker.postMessage(request, transfer);
    } catch (error) {
      settle(() => reject(error));
    }
  });
}

function deserializeWorkerError(serialized: { name: string; message: string; code?: string }) {
  const error = new Error(serialized.message);
  error.name = serialized.name || "Error";
  if (serialized.code) Object.assign(error, { code: serialized.code });
  return error;
}

function abortError() {
  return new DOMException("Word diff loading was aborted.", "AbortError");
}
