import type { GitFileDiff } from "../../../types/electron";
import { FormatAwareDiff } from "./FormatAwareDiff";
import { resolveDiffViewer } from "./core/registry";

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
  const resolvedViewer = resolveDiffViewer(file);
  const format = resolvedViewer.format;
  const displayPath = file.oldPath && file.oldPath !== file.path
    ? `${file.oldPath} → ${file.path}`
    : file.path;
  const identity = getGitFileIdentity(file);

  return (
    <section className="desktop-file-diff" data-change-kind={file.status}>
      <div className="desktop-file-diff-header" data-file-format={format.id}>
        <div className="desktop-file-diff-facts">
          <span className="desktop-file-format-label" title={`${format.label} file`}>
            {format.label}
          </span>
          <span className={`desktop-change-badge ${file.status}`}>{getGitChangeLabel(file.status)}</span>
          {file.additions != null && file.deletions != null && (
            <span className="desktop-file-diff-stat" aria-label={`${file.additions} additions, ${file.deletions} deletions`}>
              <span className="added">+{file.additions}</span>
              <span className="deleted">-{file.deletions}</span>
            </span>
          )}
        </div>

        <div className="desktop-file-diff-identity" title={displayPath} aria-label={displayPath}>
          <span className="desktop-file-diff-name">{identity.name}</span>
          {identity.directory && (
            <span className="desktop-file-diff-directory">{identity.directory}</span>
          )}
        </div>
      </div>

      <FormatAwareDiff
        file={file}
        canOpenFile={canOpenFile}
        onOpenFile={onOpenFile}
        resolvedViewer={resolvedViewer}
      />
    </section>
  );
}

function getGitFileIdentity(file: GitFileDiff) {
  const current = splitGitPath(file.path);
  if (!file.oldPath || file.oldPath === file.path) return current;

  const previous = splitGitPath(file.oldPath);
  return {
    name: previous.name === current.name
      ? current.name
      : `${previous.name} → ${current.name}`,
    directory: previous.directory === current.directory
      ? current.directory
      : [previous.directory, current.directory].filter(Boolean).join(" → "),
  };
}

function splitGitPath(value: string) {
  const separator = value.lastIndexOf("/");
  if (separator < 0) return { name: value, directory: "" };
  return {
    name: value.slice(separator + 1),
    directory: value.slice(0, separator),
  };
}

function getGitChangeLabel(status: GitFileDiff["status"]) {
  if (status === "added") return "Added";
  if (status === "deleted") return "Deleted";
  if (status === "renamed") return "Renamed";
  if (status === "copied") return "Copied";
  if (status === "modified") return "Modified";
  return "Changed";
}
