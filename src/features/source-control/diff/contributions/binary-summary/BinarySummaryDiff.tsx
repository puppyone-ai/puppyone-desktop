import { ExternalLink, FileWarning } from "lucide-react";
import { bidiIsolate, type MessageFormatter } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import type { GitRevisionSide } from "../../../../../types/electron";
import type { DiffRendererProps } from "../../core/types";

export function BinarySummaryDiff({ file, format, canOpenFile, onOpenFile }: DiffRendererProps) {
  const { formatNumber, t } = useLocalization();
  const pair = file.revisionPair;
  const unavailable = [pair?.before, pair?.after]
    .filter((side): side is Extract<GitRevisionSide, { kind: "unavailable" }> => side?.kind === "unavailable");

  return (
    <div className="desktop-binary-diff-summary">
      <div className="desktop-binary-diff-heading">
        <FileWarning size={16} aria-hidden="true" />
        <div>
          <strong dir="auto">{format.label}</strong>
          <span>{t("source-control.diff.binary.noSemanticDiff")}</span>
        </div>
      </div>

      {pair && (
        <div className="desktop-binary-diff-sides" aria-label={t("source-control.diff.binary.revisionMetadata")}>
          <RevisionSide label={t("source-control.diff.binary.before")} side={pair.before} formatNumber={formatNumber} t={t} />
          <RevisionSide label={t("source-control.diff.binary.after")} side={pair.after} formatNumber={formatNumber} t={t} />
        </div>
      )}

      {unavailable.map((side) => (
        <div className="desktop-binary-diff-warning" key={`${side.identity}:${side.reason}`}>
          {t("source-control.diff.binary.revisionUnavailableDetail", {
            detail: bidiIsolate(side.message),
          })}
        </div>
      ))}

      {canOpenFile && onOpenFile && (
        <button
          type="button"
          className="secondary-action desktop-binary-diff-open"
          onClick={() => onOpenFile(file.path)}
        >
          <ExternalLink size={13} aria-hidden="true" />
          {t("source-control.diff.binary.openCurrentFile")}
        </button>
      )}
    </div>
  );
}

function RevisionSide({
  label,
  side,
  formatNumber,
  t,
}: {
  label: string;
  side: GitRevisionSide;
  formatNumber: ReturnType<typeof useLocalization>["formatNumber"];
  t: MessageFormatter;
}) {
  return (
    <div className={`desktop-binary-diff-side ${side.kind}`}>
      <span>{label}</span>
      <strong>{side.kind === "missing"
        ? t("source-control.diff.binary.notPresent")
        : formatBytes(side.size, formatNumber, t)}</strong>
    </div>
  );
}

function formatBytes(
  value: number | null,
  formatNumber: ReturnType<typeof useLocalization>["formatNumber"],
  t: MessageFormatter,
) {
  if (value == null) return t("source-control.diff.binary.unavailable");
  if (value < 1024) {
    return formatNumber(value, { style: "unit", unit: "byte", unitDisplay: "short" });
  }
  if (value < 1024 * 1024) {
    return formatNumber(value / 1024, {
      maximumFractionDigits: 1,
      style: "unit",
      unit: "kilobyte",
      unitDisplay: "short",
    });
  }
  return formatNumber(value / (1024 * 1024), {
    maximumFractionDigits: 1,
    style: "unit",
    unit: "megabyte",
    unitDisplay: "short",
  });
}
