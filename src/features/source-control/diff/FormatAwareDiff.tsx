import type { GitFileDiff } from "../../../types/electron";
import { resolveDiffViewer } from "./core/registry";

export function FormatAwareDiff({
  file,
  canOpenFile,
  onOpenFile,
}: {
  file: GitFileDiff;
  canOpenFile?: boolean;
  onOpenFile?: (path: string) => void;
}) {
  const resolved = resolveDiffViewer(file);
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
