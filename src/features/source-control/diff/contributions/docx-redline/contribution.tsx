import { createAsyncDiffContribution } from "../../core/createAsyncDiffContribution";
import type { DiffRendererProps } from "../../core/types";
import {
  DocxRedlineError,
  DocxRedlineLoading,
  DocxRedlineView,
} from "./DocxRedlineView";
import { DOCX_REDLINE_RENDERER_VERSION, type DocxRedlinePresentation } from "./model";

const DOCX_OPEN_XML_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const docxRedlineContribution = createAsyncDiffContribution<DocxRedlinePresentation>({
  id: "docx-redline",
  version: DOCX_REDLINE_RENDERER_VERSION,
  source: "resource-pair",
  match: ({ file, format }) => format.id === "docx" && hasDocxOpenXmlRevision(file),
  loadIdentity: ({ file }) => {
    const pair = requireRevisionPair(file);
    return [
      pair.sessionId,
      pair.selectionIdentity,
      pair.before.identity,
      pair.after.identity,
      `docx-redline@${DOCX_REDLINE_RENDERER_VERSION}`,
    ].join("\0");
  },
  load: async ({ file }, signal) => {
    const pair = requireRevisionPair(file);
    const { loadDocxRedline } = await import("./provider");
    return loadDocxRedline(pair, signal);
  },
  renderModel: DocxRedlineView,
  renderLoading: DocxRedlineLoading,
  renderError: DocxRedlineError,
});

function hasDocxOpenXmlRevision(file: DiffRendererProps["file"]) {
  const pair = file.revisionPair;
  if (!pair) return false;
  return [file.mimeType, pair.before.mimeType, pair.after.mimeType]
    .some((mimeType) => mimeType?.toLowerCase() === DOCX_OPEN_XML_MIME);
}

function requireRevisionPair(file: DiffRendererProps["file"]) {
  if (!file.revisionPair) {
    throw new Error("The revision pair is unavailable for this Word document.");
  }
  return file.revisionPair;
}
