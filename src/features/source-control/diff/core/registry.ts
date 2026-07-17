import { resolveFileFormat } from "@puppyone/shared-ui";
import { binarySummaryContribution } from "../contributions/binary-summary/contribution";
import { docxRedlineContribution } from "../contributions/docx-redline/contribution";
import { textUnifiedContribution } from "../contributions/text-unified/contribution";
import type { DiffViewerContribution, ResolvedDiffViewer } from "./types";
import type { GitFileDiff } from "../../../../types/electron";

export const DIFF_VIEWERS: readonly DiffViewerContribution[] = Object.freeze([
  docxRedlineContribution,
  textUnifiedContribution,
  binarySummaryContribution,
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
