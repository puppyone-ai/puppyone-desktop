import type { SpreadsheetArchiveKind, SpreadsheetPreviewResult } from "./spreadsheetPreview";

export const DEFAULT_SPREADSHEET_WORKER_TIMEOUT_MS = 15_000;

type SpreadsheetWorkerResponse =
  | { ok: true; result: SpreadsheetPreviewResult }
  | { ok: false; error: { name: string; message: string; stack?: string } };

export function parseSpreadsheetInWorker(
  arrayBuffer: ArrayBuffer,
  {
    archiveKind,
    signal,
    timeoutMs = DEFAULT_SPREADSHEET_WORKER_TIMEOUT_MS,
  }: {
    archiveKind: SpreadsheetArchiveKind;
    signal?: AbortSignal;
    timeoutMs?: number;
  },
): Promise<SpreadsheetPreviewResult> {
  return new Promise((resolve, reject) => {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      reject(new RangeError("Spreadsheet preview worker timeout must be a positive finite number."));
      return;
    }
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }

    const worker = new Worker(
      new URL("./spreadsheetPreview.worker.ts", import.meta.url),
      { type: "module", name: "puppyone-spreadsheet-preview" },
    );
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      signal?.removeEventListener("abort", handleAbort);
      if (timeoutId !== null) clearTimeout(timeoutId);
      worker.terminate();
    };
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const handleAbort = () => {
      settle(() => reject(createAbortError()));
    };
    const handleTimeout = () => {
      settle(() => reject(createTimeoutError(timeoutMs)));
    };

    worker.onmessage = (event: MessageEvent<SpreadsheetWorkerResponse>) => {
      settle(() => {
        if (event.data.ok) {
          resolve(event.data.result);
          return;
        }
        const error = new Error(event.data.error.message);
        error.name = event.data.error.name;
        error.stack = event.data.error.stack;
        reject(error);
      });
    };
    worker.onerror = (event) => {
      settle(() => reject(new Error(event.message || "Spreadsheet preview worker failed.")));
    };
    worker.onmessageerror = () => {
      settle(() => reject(new Error("Spreadsheet preview worker returned an unreadable response.")));
    };
    signal?.addEventListener("abort", handleAbort, { once: true });
    timeoutId = setTimeout(handleTimeout, timeoutMs);

    try {
      worker.postMessage({ arrayBuffer, archiveKind }, [arrayBuffer]);
    } catch (error) {
      settle(() => reject(error));
    }
  });
}

function createAbortError(): DOMException {
  return new DOMException("Spreadsheet preview parsing was aborted.", "AbortError");
}

function createTimeoutError(timeoutMs: number): DOMException {
  return new DOMException(
    `Spreadsheet preview parsing exceeded the ${Math.round(timeoutMs)} ms limit.`,
    "TimeoutError",
  );
}
