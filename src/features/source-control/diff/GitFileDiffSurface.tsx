import { FileText } from "lucide-react";
import type { GitFileDiff } from "../../../types/electron";
import { FormatAwareDiff } from "./FormatAwareDiff";

export type GitFileDiffSurfaceProps = {
  file: GitFileDiff;
  canOpenFile?: boolean;
  onOpenFile?: (path: string) => void;
};

/** Canonical file-level diff chrome shared by Changes and History. */
export function GitFileDiffSurface({
  file,
  canOpenFile = false,
  onOpenFile,
}: GitFileDiffSurfaceProps) {
  const displayPath = file.oldPath && file.oldPath !== file.path
    ? `${file.oldPath} → ${file.path}`
    : file.path;

  return (
    <section className="desktop-file-diff" data-change-kind={file.status}>
      <div className="desktop-file-diff-header">
        <span className={`desktop-change-badge ${file.status}`}>{getGitChangeLabel(file.status)}</span>
        <FileText size={14} aria-hidden="true" />
        <span className="desktop-file-diff-path" title={displayPath}>
          {displayPath}
        </span>
        {file.additions != null && file.deletions != null && (
          <span className="desktop-file-diff-stat" aria-label={`${file.additions} additions, ${file.deletions} deletions`}>
            <span className="added">+{file.additions}</span>
            <span className="deleted">-{file.deletions}</span>
          </span>
        )}
      </div>

      <FormatAwareDiff
        file={file}
        canOpenFile={canOpenFile}
        onOpenFile={onOpenFile}
      />
    </section>
  );
}

function getGitChangeLabel(status: GitFileDiff["status"]) {
  if (status === "added") return "Added";
  if (status === "deleted") return "Deleted";
  if (status === "renamed") return "Renamed";
  if (status === "copied") return "Copied";
  if (status === "modified") return "Modified";
  return "Changed";
}
