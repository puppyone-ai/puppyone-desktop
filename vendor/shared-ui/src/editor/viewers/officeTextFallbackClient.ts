import {
  deserializeOfficeTextFallbackError,
  type ExtractOpenDocumentTextTask,
  type ExtractPresentationTextTask,
  type OfficeTextFallbackResult,
  type OfficeTextFallbackTask,
  type OfficeTextFallbackWorkerRequest,
  type OfficeTextFallbackWorkerResponse,
  type OpenDocumentTextFallbackResult,
  type PresentationTextFallbackResult,
} from "./officeTextFallbackTask";

export const DEFAULT_OFFICE_TEXT_FALLBACK_WORKER_TIMEOUT_MS = 10_000;

type OfficeTextFallbackWorkerControls = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type ExtractPresentationTextClientOptions = ExtractPresentationTextTask
  & OfficeTextFallbackWorkerControls;

export type ExtractOpenDocumentTextClientOptions = ExtractOpenDocumentTextTask
  & OfficeTextFallbackWorkerControls;

export type OfficeTextFallbackClientOptions =
  | ExtractPresentationTextClientOptions
  | ExtractOpenDocumentTextClientOptions;

export function extractOfficeTextFallbackInWorker(
  arrayBuffer: ArrayBuffer,
  options: ExtractPresentationTextClientOptions,
): Promise<PresentationTextFallbackResult>;
export function extractOfficeTextFallbackInWorker(
  arrayBuffer: ArrayBuffer,
  options: ExtractOpenDocumentTextClientOptions,
): Promise<OpenDocumentTextFallbackResult>;
export function extractOfficeTextFallbackInWorker(
  arrayBuffer: ArrayBuffer,
  options: OfficeTextFallbackClientOptions,
): Promise<OfficeTextFallbackResult> {
  return new Promise((resolve, reject) => {
    const timeoutMs = options.timeoutMs ?? DEFAULT_OFFICE_TEXT_FALLBACK_WORKER_TIMEOUT_MS;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      reject(new RangeError("Office text fallback worker timeout must be a positive finite number."));
      return;
    }
    if (options.signal?.aborted) {
      reject(createAbortError());
      return;
    }

    const worker = new Worker(
      new URL("./officeTextFallback.worker.ts", import.meta.url),
      { type: "module", name: "puppyone-office-text-fallback" },
    );
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      options.signal?.removeEventListener("abort", handleAbort);
      if (timeoutId !== null) clearTimeout(timeoutId);
      worker.terminate();
    };
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const handleAbort = () => settle(() => reject(createAbortError()));
    const handleTimeout = () => settle(() => reject(createTimeoutError(timeoutMs)));

    worker.onmessage = (event: MessageEvent<OfficeTextFallbackWorkerResponse>) => {
      settle(() => {
        if (event.data.ok) {
          resolve(event.data.result);
          return;
        }
        reject(deserializeOfficeTextFallbackError(event.data.error));
      });
    };
    worker.onerror = (event) => {
      settle(() => reject(new Error(event.message || "Office text fallback worker failed.")));
    };
    worker.onmessageerror = () => {
      settle(() => reject(new Error("Office text fallback worker returned an unreadable response.")));
    };
    options.signal?.addEventListener("abort", handleAbort, { once: true });
    timeoutId = setTimeout(handleTimeout, timeoutMs);

    const { signal: _signal, timeoutMs: _timeoutMs, ...taskOptions } = options;
    const request: OfficeTextFallbackWorkerRequest = {
      arrayBuffer,
      task: taskOptions as OfficeTextFallbackTask,
    };
    try {
      worker.postMessage(request, [arrayBuffer]);
    } catch (error) {
      settle(() => reject(error));
    }
  });
}

function createAbortError(): DOMException {
  return new DOMException("Office text fallback extraction was aborted.", "AbortError");
}

function createTimeoutError(timeoutMs: number): DOMException {
  return new DOMException(
    `Office text fallback extraction exceeded the ${Math.round(timeoutMs)} ms limit.`,
    "TimeoutError",
  );
}
