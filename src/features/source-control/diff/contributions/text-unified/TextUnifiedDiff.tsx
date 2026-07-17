import type { GitDiffLine } from "../../../../../types/electron";
import type { DiffRendererProps } from "../../core/types";
import { useLocalization } from "@puppyone/localization/react";

export function TextUnifiedDiff({ file }: DiffRendererProps) {
  const { t } = useLocalization();
  const omittedLines = file.omittedLines ?? 0;
  if (file.lines.length === 0) {
    return (
      <div className="desktop-diff-placeholder">
        {file.truncated
          ? t(omittedLines > 0 ? "source-control.diff.truncatedCount" : "source-control.diff.truncated", { count: omittedLines })
          : t("source-control.diff.noText")}
      </div>
    );
  }

  return (
    <>
      <div className="desktop-diff-lines" dir="ltr">
        {file.lines.map((line, index) => (
          <DiffLineView line={line} key={index} />
        ))}
      </div>
      {file.truncated && (
        <div className="desktop-diff-placeholder">
          {t(omittedLines > 0 ? "source-control.diff.truncatedCount" : "source-control.diff.truncated", { count: omittedLines })}
        </div>
      )}
    </>
  );
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
