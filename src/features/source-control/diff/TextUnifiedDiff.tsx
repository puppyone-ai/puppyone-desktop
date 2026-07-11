import type { GitDiffLine } from "../../../types/electron";
import type { DiffRendererProps } from "./types";

export function TextUnifiedDiff({ file }: DiffRendererProps) {
  const omittedLines = file.omittedLines ?? 0;
  if (file.lines.length === 0) {
    return (
      <div className="desktop-diff-placeholder">
        {file.truncated ? formatDiffTruncationMessage(omittedLines) : "No textual diff available"}
      </div>
    );
  }

  return (
    <>
      <div className="desktop-diff-lines">
        {file.lines.map((line, index) => (
          <DiffLineView line={line} key={index} />
        ))}
      </div>
      {file.truncated && (
        <div className="desktop-diff-placeholder">{formatDiffTruncationMessage(omittedLines)}</div>
      )}
    </>
  );
}

export function formatDiffTruncationMessage(omittedLines: number) {
  if (omittedLines > 0) {
    return `Diff truncated. ${omittedLines.toLocaleString()} more line${omittedLines === 1 ? "" : "s"} hidden.`;
  }
  return "Diff truncated.";
}

function DiffLineView({ line }: { line: GitDiffLine }) {
  if (line.kind === "hunk") {
    return <div className="desktop-diff-hunk-separator" aria-hidden="true" />;
  }

  const displayLine = line.kind === "remove" ? line.oldLine : line.newLine ?? line.oldLine;
  const prefix = line.kind === "add" ? "+" : line.kind === "remove" ? "-" : " ";
  return (
    <div
      className={`desktop-diff-line ${line.kind}`}
      data-old-line={line.oldLine}
      data-new-line={line.newLine}
    >
      <span className="line-number">{displayLine ?? ""}</span>
      <span className="line-prefix">{prefix}</span>
      <code>{line.text || " "}</code>
    </div>
  );
}
