import {
  CircleAlert,
  File,
  FileText,
  Folder,
  Image,
  LoaderCircle,
  Paperclip,
  RefreshCcw,
  X,
} from "lucide-react";
import { bidiIsolate, type MessageFormatter } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import type { AgentDraftReference } from "../../domain/agent-contract";

type AgentDraftReferenceListProps = {
  references: AgentDraftReference[];
  getPreviewUrl?: (id: string) => string | null;
  onRemove?: (id: string) => void;
  onRetry?: (id: string) => void;
};

export function AgentDraftReferenceList({
  references,
  getPreviewUrl,
  onRemove,
  onRetry,
}: AgentDraftReferenceListProps) {
  const { t } = useLocalization();
  if (references.length === 0) return null;
  return (
    <div className="desktop-agent-reference-cards" role="list" aria-label={t("agent.reference.selected")}>
      {references.map((reference) => (
        <ReferenceCard
          key={reference.id}
          reference={reference}
          previewUrl={getPreviewUrl?.(reference.id) ?? null}
          onRemove={() => onRemove?.(reference.id)}
          onRetry={reference.status === "error" ? () => onRetry?.(reference.id) : undefined}
        />
      ))}
    </div>
  );
}

function ReferenceCard({ reference, previewUrl, onRemove, onRetry }: {
  reference: AgentDraftReference;
  previewUrl: string | null;
  onRemove: () => void;
  onRetry?: () => void;
}) {
  const { t } = useLocalization();
  const image = reference.mime?.startsWith("image/") === true;
  const directory = reference.kind === "workspace-entry" && reference.entryType === "directory";
  const statusLabel = reference.status === "resolving"
    ? t("agent.reference.resolving")
    : reference.status === "error" ? localizedReferenceError(reference, t) : "";
  const relativePath = reference.kind === "workspace-entry" ? reference.relativePath : "";
  const rawError = reference.status === "error" ? reference.error?.message || "" : "";
  const details = [
    relativePath !== reference.displayName ? relativePath : "",
    statusLabel,
    rawError !== statusLabel ? rawError : "",
  ].filter(Boolean);
  const classes = [
    "desktop-agent-reference-card",
    image ? "is-image-card" : "is-file-card",
    `is-${reference.status}`,
  ].join(" ");

  return (
    <div
      className={classes}
      dir="auto"
      role="listitem"
      title={details.join("\n") || undefined}
      aria-label={[reference.displayName, ...details].join(": ")}
    >
      {image ? (
        <span className="desktop-agent-reference-image-preview">
          {previewUrl
            ? <img src={previewUrl} alt="" draggable={false} />
            : <Image size={22} aria-hidden="true" />}
        </span>
      ) : (
        <span className="desktop-agent-reference-file-icon" aria-hidden="true">
          {directory
            ? <Folder size={22} />
            : reference.mime === "text/markdown"
              ? <FileText size={22} />
              : reference.kind === "workspace-entry" ? <File size={22} /> : <Paperclip size={22} />}
        </span>
      )}
      {!image && (
        <span className="desktop-agent-reference-card-copy">
          <strong>{reference.displayName}</strong>
          <small>{statusLabel || referenceTypeLabel(reference)}</small>
        </span>
      )}
      {reference.status === "resolving" && (
        <span className="desktop-agent-reference-card-status" aria-hidden="true">
          <LoaderCircle size={13} className="desktop-agent-spin" />
        </span>
      )}
      {reference.status === "error" && (
        <span className="desktop-agent-reference-card-status is-error" aria-hidden="true">
          <CircleAlert size={13} />
        </span>
      )}
      <span className="desktop-agent-reference-card-actions">
        {onRetry && (
          <button
            type="button"
            aria-label={t("agent.reference.retry", { name: bidiIsolate(reference.displayName) })}
            onClick={onRetry}
          >
            <RefreshCcw size={11} aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          aria-label={t("agent.reference.remove", { name: bidiIsolate(reference.displayName) })}
          onClick={onRemove}
        >
          <X size={12} aria-hidden="true" />
        </button>
      </span>
    </div>
  );
}

function referenceTypeLabel(reference: AgentDraftReference) {
  if (reference.kind === "workspace-entry" && reference.entryType === "directory") return "DIR";
  const extension = /\.([A-Za-z0-9]{1,8})$/.exec(reference.displayName)?.[1];
  if (extension) return extension.toUpperCase();
  if (reference.mime === "text/markdown") return "MD";
  const subtype = reference.mime?.split("/")[1]?.split(/[;+]/)[0];
  return subtype && subtype.length <= 8 ? subtype.toUpperCase() : "FILE";
}

const LOCALIZED_REFERENCE_ERROR_CODES = new Set([
  "capability-unreported",
  "reference-size",
  "workspace-directory-unsupported",
  "workspace-file-unsupported",
  "image-unsupported",
  "file-unsupported",
  "mime-unsupported",
  "reference-limit",
  "reference-total-size",
  "workspace-resolution-failed",
]);

function localizedReferenceError(reference: AgentDraftReference, t: MessageFormatter) {
  const code = reference.error?.code;
  if (code && LOCALIZED_REFERENCE_ERROR_CODES.has(code)) return t(`agent.reference.error.${code}`);
  return reference.error?.message || t("agent.reference.failed");
}
