import { resolveFileFormat, type FileFormat } from "@puppyone/shared-ui";
import type { GitFileDiff } from "../../types/electron";

export type GitDiffSourceRequirement = "git-patch" | "resource-pair" | "metadata";

export type GitDiffPresentation = {
  id: "text-unified" | "docx-redline" | "binary-summary";
  source: GitDiffSourceRequirement;
  format: FileFormat;
};

type GitDiffViewerContribution = {
  id: GitDiffPresentation["id"];
  source: GitDiffSourceRequirement;
  match: (input: { file: GitFileDiff; format: FileFormat }) => boolean;
};

/**
 * Ordered, built-in-only resolver for Changes. File-format recognition remains
 * canonical in shared-ui; this registry decides only which diff capability can
 * truthfully render the source currently supplied by the main process.
 *
 * `docx-redline` is deliberately registered ahead of the fallback but cannot
 * match until the revision-pair authority exists. That prevents the UI from
 * pretending a Git patch can be a semantic DOCX diff while keeping the
 * extension point deterministic for the next vertical slice.
 */
const DIFF_VIEWERS: readonly GitDiffViewerContribution[] = [
  {
    id: "docx-redline",
    source: "resource-pair",
    match: ({ file, format }) => format.id === "docx" && !file.binary,
  },
  {
    id: "text-unified",
    source: "git-patch",
    match: ({ file }) => !file.binary,
  },
  {
    id: "binary-summary",
    source: "metadata",
    match: () => true,
  },
];

export function resolveGitDiffPresentation(file: GitFileDiff): GitDiffPresentation {
  const format = resolveFileFormat({ name: file.path });
  const viewer = DIFF_VIEWERS.find((candidate) => candidate.match({ file, format }));
  if (!viewer) throw new Error("Diff registry requires a fallback contribution.");
  return { id: viewer.id, source: viewer.source, format };
}

export function getBinaryDiffSummary(file: GitFileDiff, format: FileFormat): string {
  const state = file.status === "added"
    ? "Added"
    : file.status === "deleted"
      ? "Deleted"
      : file.status === "renamed"
        ? "Renamed"
        : "Changed";
  return `${state} binary ${format.label}. Open the file to inspect it with the appropriate viewer.`;
}
