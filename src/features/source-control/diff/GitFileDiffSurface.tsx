import type { GitFileDiff } from "../../../types/electron";
import type { FileFormat } from "@puppyone/shared-ui";
import { bidiIsolate, type MessageFormatter } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
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
  const { formatNumber, t } = useLocalization();
  const resolvedViewer = resolveDiffViewer(file);
  const format = resolvedViewer.format;
  const formatLabel = getFormatLabel(format, t);
  const displayPath = file.oldPath && file.oldPath !== file.path
    ? `${file.oldPath} → ${file.path}`
    : file.path;
  const identity = getGitFileIdentity(file);

  return (
    <section className="desktop-file-diff" data-change-kind={file.status}>
      <div className="desktop-file-diff-header" data-file-format={format.id}>
        <div className="desktop-file-diff-facts">
          <span className="desktop-file-format-label" title={t("source-control.diff.formatFile", { format: bidiIsolate(formatLabel) })}>
            {formatLabel}
          </span>
          <span className={`desktop-change-badge ${file.status}`}>{getGitChangeLabel(file.status, t)}</span>
          {file.additions != null && file.deletions != null && (
            <span className="desktop-file-diff-stat" aria-label={t("source-control.diff.changeStats", {
              additions: file.additions,
              deletions: file.deletions,
            })}>
              <span className="added">+{formatNumber(file.additions)}</span>
              <span className="deleted">−{formatNumber(file.deletions)}</span>
            </span>
          )}
        </div>

        <div className="desktop-file-diff-identity" title={displayPath} aria-label={displayPath} dir="ltr">
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

function getGitChangeLabel(status: GitFileDiff["status"], t: MessageFormatter) {
  if (status === "added") return t("source-control.diff.change.added");
  if (status === "deleted") return t("source-control.diff.change.deleted");
  if (status === "renamed") return t("source-control.diff.change.renamed");
  if (status === "copied") return t("source-control.diff.change.copied");
  if (status === "modified") return t("source-control.diff.change.modified");
  return t("source-control.diff.change.changed");
}

function getFormatLabel(format: FileFormat, t: MessageFormatter): string {
  if (format.id === "image-unknown") return t("source-control.diff.format.image");
  if (format.id === "text-unknown") return t("source-control.diff.format.text");
  if (format.id === "unknown") return t("source-control.diff.format.file");
  return format.label;
}
