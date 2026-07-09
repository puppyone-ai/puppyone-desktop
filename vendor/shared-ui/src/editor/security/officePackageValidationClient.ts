import {
  deserializeOfficePackageValidationError,
  type OfficePackageValidationOptions,
  type OfficePackageValidationResult,
  type OfficePackageValidationWorkerRequest,
  type OfficePackageValidationWorkerResponse,
} from "./officePackageValidationTask";

export const DEFAULT_OFFICE_PACKAGE_VALIDATION_WORKER_TIMEOUT_MS = 15_000;

export type OfficePackageValidationClientOptions = OfficePackageValidationOptions & {
  signal?: AbortSignal;
  timeoutMs?: number;
};

export function validateOfficePackageInWorker(
  arrayBuffer: ArrayBuffer,
  {
    profile,
    budget,
    signal,
    timeoutMs = DEFAULT_OFFICE_PACKAGE_VALIDATION_WORKER_TIMEOUT_MS,
  }: OfficePackageValidationClientOptions,
): Promise<OfficePackageValidationResult> {
  return new Promise((resolve, reject) => {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      reject(new RangeError("Office package validation worker timeout must be a positive finite number."));
      return;
    }
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }

    const worker = new Worker(
      new URL("./officePackageValidation.worker.ts", import.meta.url),
      { type: "module", name: "puppyone-office-package-validation" },
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

    worker.onmessage = (event: MessageEvent<OfficePackageValidationWorkerResponse>) => {
      settle(() => {
        if (event.data.ok) {
          resolve(event.data.result);
          return;
        }
        reject(deserializeOfficePackageValidationError(event.data.error));
      });
    };
    worker.onerror = (event) => {
      settle(() => reject(new Error(event.message || "Office package validation worker failed.")));
    };
    worker.onmessageerror = () => {
      settle(() => reject(new Error("Office package validation worker returned an unreadable response.")));
    };
    signal?.addEventListener("abort", handleAbort, { once: true });
    timeoutId = setTimeout(handleTimeout, timeoutMs);

    const request: OfficePackageValidationWorkerRequest = {
      arrayBuffer,
      options: { profile, budget },
    };
    try {
      worker.postMessage(request, [arrayBuffer]);
    } catch (error) {
      settle(() => reject(error));
    }
  });
}

function createAbortError(): DOMException {
  return new DOMException("Office package validation was aborted.", "AbortError");
}

function createTimeoutError(timeoutMs: number): DOMException {
  return new DOMException(
    `Office package validation exceeded the ${Math.round(timeoutMs)} ms limit.`,
    "TimeoutError",
  );
}
