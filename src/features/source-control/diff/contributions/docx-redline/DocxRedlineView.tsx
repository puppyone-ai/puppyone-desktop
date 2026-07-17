import { FileWarning, LoaderCircle, RefreshCw } from "lucide-react";
import { bidiIsolate, type MessageFormatter } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import type {
  DiffErrorRendererProps,
  DiffLoadingRendererProps,
  DiffModelRendererProps,
} from "../../core/types";
import type { DocxRedlinePresentation } from "./model";

export function DocxRedlineLoading(_props: DiffLoadingRendererProps) {
  const { t } = useLocalization();
  return (
    <div className="desktop-docx-diff-state" role="status">
      <LoaderCircle className="spin" size={16} aria-hidden="true" />
      {t("source-control.diff.docx.loading")}
    </div>
  );
}

export function DocxRedlineError({ message, onRetry }: DiffErrorRendererProps) {
  const { t } = useLocalization();
  return (
    <div className="desktop-docx-diff-state error" role="alert">
      <FileWarning size={16} aria-hidden="true" />
      <div>
        <strong>{t("source-control.diff.docx.unavailable")}</strong>
        <span>{t("source-control.diff.docx.unavailableDetail", { detail: bidiIsolate(message) })}</span>
      </div>
      <button type="button" className="secondary-action" onClick={onRetry}>
        <RefreshCw size={13} aria-hidden="true" />
        {t("source-control.diff.retry")}
      </button>
    </div>
  );
}

export function DocxRedlineView({ model }: DiffModelRendererProps<DocxRedlinePresentation>) {
  const { t } = useLocalization();
  const fidelityNote = t("source-control.diff.docx.fidelity.bodyTextV1");
  if (model.changes.length === 0) {
    return (
      <div className="desktop-docx-diff-state">
        <div>
          <strong>{documentStateLabel(model.state, t)}</strong>
          <span>{t("source-control.diff.docx.noParagraphChanges")}</span>
          <span>{fidelityNote}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="desktop-docx-redline">
      {model.state !== "ready" && (
        <div className={`desktop-docx-redline-document-state ${model.state}`}>
          {documentStateLabel(model.state, t)}
        </div>
      )}
      <div className="desktop-docx-redline-summary">
        <span className="added">{t("source-control.diff.docx.wordsAdded", { count: model.stats.wordsAdded })}</span>
        <span className="deleted">{t("source-control.diff.docx.wordsDeleted", { count: model.stats.wordsDeleted })}</span>
        <span>{t("source-control.diff.docx.blocksChanged", { count: model.stats.blocksChanged })}</span>
      </div>
      <div className="desktop-docx-redline-changes">
        {model.changes.map((change) => (
          <article className={`desktop-docx-redline-block ${change.kind}`} key={change.id}>
            <div className="desktop-docx-redline-location">
              <span>{blockKindLabel(change.blockKind, t)}</span>
              <code>{formatLocation(change.beforeIndex, change.afterIndex, t)}</code>
            </div>
            <p>
              {change.segments.map((segment, index) => (
                <span className={segment.kind} key={`${index}:${segment.text}`}>{segment.text}</span>
              ))}
            </p>
          </article>
        ))}
      </div>
      {model.truncated && <div className="desktop-docx-redline-limit">{t("source-control.diff.docx.truncated")}</div>}
      <div className="desktop-docx-redline-fidelity">{fidelityNote}</div>
    </div>
  );
}

function documentStateLabel(state: DocxRedlinePresentation["state"], t: MessageFormatter) {
  if (state === "added") return t("source-control.diff.docx.state.added");
  if (state === "deleted") return t("source-control.diff.docx.state.deleted");
  if (state === "empty") return t("source-control.diff.docx.state.empty");
  return t("source-control.diff.docx.state.ready");
}

function blockKindLabel(
  kind: DocxRedlinePresentation["changes"][number]["blockKind"],
  t: MessageFormatter,
) {
  if (kind === "table-row") return t("source-control.diff.docx.block.tableRow");
  if (kind === "list-item") return t("source-control.diff.docx.block.listItem");
  if (kind === "heading") return t("source-control.diff.docx.block.heading");
  return t("source-control.diff.docx.block.paragraph");
}

function formatLocation(
  beforeIndex: number | null,
  afterIndex: number | null,
  t: MessageFormatter,
) {
  if (beforeIndex != null && afterIndex != null) {
    return t("source-control.diff.docx.location.changed", {
      before: beforeIndex + 1,
      after: afterIndex + 1,
    });
  }
  const index = beforeIndex ?? afterIndex;
  if (index != null) {
    return t("source-control.diff.docx.location.paragraph", {
      number: index + 1,
    });
  }
  return t("source-control.diff.docx.location.document");
}
