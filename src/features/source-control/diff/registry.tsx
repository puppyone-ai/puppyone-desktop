import { resolveFileFormat, isTextLikeFileFormat } from "@puppyone/shared-ui";
import { BinarySummaryDiff } from "./BinarySummaryDiff";
import { DocxRedlineDiff } from "./DocxRedlineDiff";
import { TextUnifiedDiff } from "./TextUnifiedDiff";
import type { DiffViewerContribution, ResolvedDiffViewer } from "./types";
import type { GitFileDiff } from "../../../types/electron";

const DOCX_OPEN_XML_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const DIFF_VIEWERS: readonly DiffViewerContribution[] = Object.freeze([
  {
    id: "docx-redline",
    version: "1",
    source: "resource-pair",
    match: ({ file, format }) => (
      format.id === "docx" && hasDocxOpenXmlRevision(file)
    ),
    render: DocxRedlineDiff,
  },
  {
    id: "text-unified",
    version: "1",
    source: "git-patch",
    match: ({ file, format }) => (
      file.binary !== true && (isTextLikeFileFormat(format) || file.lines.length > 0)
    ),
    render: TextUnifiedDiff,
  },
  {
    id: "binary-summary",
    version: "1",
    source: "metadata",
    match: () => true,
    render: BinarySummaryDiff,
  },
]);

export function resolveDiffViewer(file: GitFileDiff): ResolvedDiffViewer {
  const format = resolveFileFormat({
    name: file.path || file.oldPath,
    mimeType: file.mimeType,
  });
  const contribution = DIFF_VIEWERS.find((candidate) => candidate.match({ file, format }));
  if (!contribution) throw new Error("Built-in diff registry has no fallback contribution.");
  return {
    id: contribution.id,
    version: contribution.version,
    source: contribution.source,
    format,
    contribution,
  };
}

function hasDocxOpenXmlRevision(file: GitFileDiff) {
  const pair = file.revisionPair;
  if (!pair) return false;
  return [file.mimeType, pair.before.mimeType, pair.after.mimeType]
    .some((mimeType) => mimeType?.toLowerCase() === DOCX_OPEN_XML_MIME);
}
