import { readWorkspaceGitDiffResource } from "../../../../lib/localFiles";
import type { GitRevisionPair, GitRevisionSide } from "../../../../types/electron";
import { buildDocxRedlineInWorker } from "./docxRedlineClient";
import {
  createDocxRedlineCacheKey,
  readDocxRedlineCache,
  writeDocxRedlineCache,
} from "./docxRedlineCache";
import { DOCX_REDLINE_RENDERER_VERSION } from "./docxRedlineTypes";
import type { DocxRedlinePresentation } from "./docxRedlineTypes";

type DocxRedlineProviderDependencies = {
  readResource(request: {
    handle: string;
    sessionId: string;
    selectionIdentity: string;
    revisionIdentity: string;
  }): Promise<ArrayBuffer>;
  build(
    before: ArrayBuffer | null,
    after: ArrayBuffer | null,
    signal: AbortSignal,
  ): Promise<DocxRedlinePresentation>;
  readCache(key: string): DocxRedlinePresentation | undefined;
  writeCache(key: string, model: DocxRedlinePresentation): void;
};

const defaultDependencies: DocxRedlineProviderDependencies = {
  readResource: readWorkspaceGitDiffResource,
  build: buildDocxRedlineInWorker,
  readCache: readDocxRedlineCache,
  writeCache: writeDocxRedlineCache,
};

export async function loadDocxRedline(
  pair: GitRevisionPair,
  signal: AbortSignal,
  dependencies: DocxRedlineProviderDependencies = defaultDependencies,
) {
  const cacheKey = createDocxRedlineCacheKey(pair, DOCX_REDLINE_RENDERER_VERSION);
  const cached = dependencies.readCache(cacheKey);
  if (cached) return cached;
  throwIfAborted(signal);

  const [before, after] = await Promise.all([
    readRevision(pair, pair.before, signal, dependencies),
    readRevision(pair, pair.after, signal, dependencies),
  ]);
  throwIfAborted(signal);
  const model = await dependencies.build(before, after, signal);
  throwIfAborted(signal);
  if (model.rendererVersion !== DOCX_REDLINE_RENDERER_VERSION) {
    throw new Error("Word diff worker returned an incompatible model version.");
  }
  dependencies.writeCache(cacheKey, model);
  return model;
}

async function readRevision(
  pair: GitRevisionPair,
  side: GitRevisionSide,
  signal: AbortSignal,
  dependencies: DocxRedlineProviderDependencies,
) {
  if (side.kind === "missing") return null;
  if (side.kind === "unavailable") throw new Error(side.message);
  if (side.kind !== "resource") {
    throw new Error("Word semantic diff requires an immutable binary revision resource.");
  }
  throwIfAborted(signal);
  const bytes = await dependencies.readResource({
    handle: side.handle,
    sessionId: pair.sessionId,
    selectionIdentity: pair.selectionIdentity,
    revisionIdentity: side.identity,
  });
  throwIfAborted(signal);
  return bytes;
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException("Word diff loading was aborted.", "AbortError");
}
