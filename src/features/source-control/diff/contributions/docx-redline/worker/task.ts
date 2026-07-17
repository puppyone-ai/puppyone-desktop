import { DOCX_REDLINE_BUDGET } from "../budget";
import { DOCX_REDLINE_RENDERER_VERSION, type DocxRedlinePresentation } from "../model";
import { alignDocxBlocks, summarizeDocxChanges } from "./align";
import { parseDocxRevision } from "./package";

export type DocxRedlineWorkerRequest = {
  before: ArrayBuffer | null;
  after: ArrayBuffer | null;
};

export type DocxRedlineWorkerResponse =
  | { ok: true; model: DocxRedlinePresentation }
  | { ok: false; error: { name: string; message: string; code?: string } };

export async function buildDocxRedlinePresentation(
  beforeBuffer: ArrayBuffer | null,
  afterBuffer: ArrayBuffer | null,
): Promise<DocxRedlinePresentation> {
  if (!beforeBuffer && !afterBuffer) {
    throw new Error("Both Word revisions are missing.");
  }

  // Parse sequentially to keep peak decompression memory bounded inside the
  // disposable worker. Alignment starts only after both normalized models exist.
  const before = beforeBuffer ? await parseDocxRevision(beforeBuffer) : [];
  const after = afterBuffer ? await parseDocxRevision(afterBuffer) : [];
  const allChanges = alignDocxBlocks(before, after);
  const stats = summarizeDocxChanges(allChanges);
  const truncated = allChanges.length > DOCX_REDLINE_BUDGET.maxPresentedChanges;
  const changes = truncated
    ? allChanges.slice(0, DOCX_REDLINE_BUDGET.maxPresentedChanges)
    : allChanges;

  return {
    kind: "docx-redline",
    rendererVersion: DOCX_REDLINE_RENDERER_VERSION,
    state: beforeBuffer == null
      ? "added"
      : afterBuffer == null
        ? "deleted"
        : allChanges.length === 0
          ? "empty"
          : "ready",
    stats,
    changes,
    truncated,
    fidelity: "body-text-v1",
  };
}

export async function runDocxRedlineWorkerTask(
  request: DocxRedlineWorkerRequest,
  postMessage: (response: DocxRedlineWorkerResponse) => void,
) {
  try {
    const model = await buildDocxRedlinePresentation(request.before, request.after);
    postMessage({ ok: true, model });
  } catch (error) {
    postMessage({ ok: false, error: serializeTaskError(error) });
  }
}

function serializeTaskError(error: unknown) {
  if (!(error instanceof Error)) return { name: "Error", message: String(error) };
  return {
    name: error.name,
    message: error.message,
    ...("code" in error && typeof error.code === "string" ? { code: error.code } : {}),
  };
}
