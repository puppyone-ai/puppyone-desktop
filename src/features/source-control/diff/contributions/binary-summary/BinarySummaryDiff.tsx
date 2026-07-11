import { ExternalLink, FileWarning } from "lucide-react";
import type { GitRevisionSide } from "../../../../../types/electron";
import type { DiffRendererProps } from "../../core/types";

export function BinarySummaryDiff({ file, format, canOpenFile, onOpenFile }: DiffRendererProps) {
  const pair = file.revisionPair;
  const unavailable = [pair?.before, pair?.after]
    .filter((side): side is Extract<GitRevisionSide, { kind: "unavailable" }> => side?.kind === "unavailable");

  return (
    <div className="desktop-binary-diff-summary">
      <div className="desktop-binary-diff-heading">
        <FileWarning size={16} aria-hidden="true" />
        <div>
          <strong>{format.label}</strong>
          <span>No specialized semantic diff is available for this format yet.</span>
        </div>
      </div>

      {pair && (
        <div className="desktop-binary-diff-sides" aria-label="Revision metadata">
          <RevisionSide label="Before" side={pair.before} />
          <RevisionSide label="After" side={pair.after} />
        </div>
      )}

      {unavailable.map((side) => (
        <div className="desktop-binary-diff-warning" key={`${side.identity}:${side.reason}`}>
          {side.message}
        </div>
      ))}

      {canOpenFile && onOpenFile && (
        <button
          type="button"
          className="secondary-action desktop-binary-diff-open"
          onClick={() => onOpenFile(file.path)}
        >
          <ExternalLink size={13} aria-hidden="true" />
          Open current file
        </button>
      )}
    </div>
  );
}

function RevisionSide({ label, side }: { label: string; side: GitRevisionSide }) {
  return (
    <div className={`desktop-binary-diff-side ${side.kind}`}>
      <span>{label}</span>
      <strong>{side.kind === "missing" ? "Not present" : formatBytes(side.size)}</strong>
    </div>
  );
}

function formatBytes(value: number | null) {
  if (value == null) return "Unavailable";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
