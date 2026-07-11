import { FileWarning, LoaderCircle, RefreshCw } from "lucide-react";
import type {
  DiffErrorRendererProps,
  DiffLoadingRendererProps,
  DiffModelRendererProps,
} from "../../core/types";
import type { DocxRedlinePresentation } from "./model";

export function DocxRedlineLoading(_props: DiffLoadingRendererProps) {
  return (
    <div className="desktop-docx-diff-state" role="status">
      <LoaderCircle className="spin" size={16} aria-hidden="true" />
      Building semantic Word diff…
    </div>
  );
}

export function DocxRedlineError({ message, onRetry }: DiffErrorRendererProps) {
  return (
    <div className="desktop-docx-diff-state error" role="alert">
      <FileWarning size={16} aria-hidden="true" />
      <div>
        <strong>Word diff unavailable</strong>
        <span>{message}</span>
      </div>
      <button type="button" className="secondary-action" onClick={onRetry}>
        <RefreshCw size={13} aria-hidden="true" />
        Retry
      </button>
    </div>
  );
}

export function DocxRedlineView({ model }: DiffModelRendererProps<DocxRedlinePresentation>) {
  if (model.changes.length === 0) {
    return (
      <div className="desktop-docx-diff-state">
        <div>
          <strong>{documentStateLabel(model.state)}</strong>
          <span>No paragraph or table text changes were detected.</span>
          <span>{model.fidelityNote}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="desktop-docx-redline">
      {model.state !== "ready" && (
        <div className={`desktop-docx-redline-document-state ${model.state}`}>
          {documentStateLabel(model.state)}
        </div>
      )}
      <div className="desktop-docx-redline-summary">
        <span className="added">+{model.stats.wordsAdded} words</span>
        <span className="deleted">−{model.stats.wordsDeleted} words</span>
        <span>{model.stats.blocksChanged} changed blocks</span>
      </div>
      <div className="desktop-docx-redline-changes">
        {model.changes.map((change) => (
          <article className={`desktop-docx-redline-block ${change.kind}`} key={change.id}>
            <div className="desktop-docx-redline-location">
              <span>{blockKindLabel(change.blockKind)}</span>
              <code>{formatLocation(change.beforeIndex, change.afterIndex)}</code>
            </div>
            <p>
              {change.segments.map((segment, index) => (
                <span className={segment.kind} key={`${index}:${segment.text}`}>{segment.text}</span>
              ))}
            </p>
          </article>
        ))}
      </div>
      {model.truncated && <div className="desktop-docx-redline-limit">Additional changes were omitted by the safety budget.</div>}
      <div className="desktop-docx-redline-fidelity">{model.fidelityNote}</div>
    </div>
  );
}

function documentStateLabel(state: DocxRedlinePresentation["state"]) {
  if (state === "added") return "Added Word document";
  if (state === "deleted") return "Deleted Word document";
  if (state === "empty") return "No semantic text changes";
  return "Word content changes";
}

function blockKindLabel(kind: DocxRedlinePresentation["changes"][number]["blockKind"]) {
  if (kind === "table-row") return "Table row";
  if (kind === "list-item") return "List item";
  if (kind === "heading") return "Heading";
  return "Paragraph";
}

function formatLocation(beforeIndex: number | null, afterIndex: number | null) {
  if (beforeIndex != null && afterIndex != null) return `P${beforeIndex + 1} → P${afterIndex + 1}`;
  if (beforeIndex != null) return `P${beforeIndex + 1}`;
  if (afterIndex != null) return `P${afterIndex + 1}`;
  return "Document";
}
