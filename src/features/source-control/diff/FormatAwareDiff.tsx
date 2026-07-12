import type { GitFileDiff } from "../../../types/electron";
import type { ResolvedDiffViewer } from "./core/types";

export function FormatAwareDiff({
  file,
  canOpenFile,
  onOpenFile,
  resolvedViewer,
}: {
  file: GitFileDiff;
  canOpenFile?: boolean;
  onOpenFile?: (path: string) => void;
  resolvedViewer: ResolvedDiffViewer;
}) {
  const resolved = resolvedViewer;
  const Renderer = resolved.contribution.render;
  return (
    <div
      className={`desktop-format-diff desktop-format-diff-${resolved.id}`}
      data-diff-source={resolved.source}
      data-file-format={resolved.format.id}
    >
      <Renderer
        file={file}
        format={resolved.format}
        canOpenFile={canOpenFile}
        onOpenFile={onOpenFile}
      />
    </div>
  );
}
