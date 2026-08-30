import { CircleAlert, File, Folder, Image, LoaderCircle, Paperclip, RefreshCcw, X } from "lucide-react";
import { bidiIsolate, type MessageFormatter } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import type { AgentDraftReference } from "../../domain/agent-contract";

type AgentDraftReferenceListProps = {
  references: AgentDraftReference[];
  onRemove?: (id: string) => void;
  onRetry?: (id: string) => void;
};

export function AgentDraftReferenceList({ references, onRemove, onRetry }: AgentDraftReferenceListProps) {
  const { t } = useLocalization();
  if (references.length === 0) return null;
  return (
    <div className="desktop-agent-reference-chips" aria-label={t("agent.reference.selected")}>
      {references.map((reference) => (
        <ReferenceChip
          key={reference.id}
          reference={reference}
          onRemove={() => onRemove?.(reference.id)}
          onRetry={reference.status === "error" ? () => onRetry?.(reference.id) : undefined}
        />
      ))}
    </div>
  );
}

function ReferenceChip({ reference, onRemove, onRetry }: {
  reference: AgentDraftReference;
  onRemove: () => void;
  onRetry?: () => void;
}) {
  const { t } = useLocalization();
  const icon = reference.status === "resolving"
    ? <LoaderCircle size={12} className="desktop-agent-spin" aria-hidden="true" />
    : reference.status === "error"
      ? <CircleAlert size={12} aria-hidden="true" />
      : reference.kind === "workspace-entry"
        ? reference.entryType === "directory" ? <Folder size={12} aria-hidden="true" /> : <File size={12} aria-hidden="true" />
        : reference.mime.startsWith("image/") ? <Image size={12} aria-hidden="true" /> : <Paperclip size={12} aria-hidden="true" />;
  const statusLabel = reference.status === "resolving"
    ? t("agent.reference.resolving")
    : reference.status === "error" ? localizedReferenceError(reference, t) : "";
  const relativePath = reference.kind === "workspace-entry" ? reference.relativePath : "";
  const image = reference.kind === "staged-attachment" && reference.mime.startsWith("image/");
  const rawError = reference.status === "error" ? reference.error?.message || "" : "";
  const details = [
    relativePath !== reference.displayName ? relativePath : "",
    statusLabel,
    rawError !== statusLabel ? rawError : "",
  ].filter(Boolean);
  return (
    <span
      className={`is-${reference.status}${image ? " is-image" : ""}`}
      dir="auto"
      role="group"
      title={details.join("\n") || undefined}
      aria-label={[reference.displayName, ...details].join(": ")}
    >
      <span className={`desktop-agent-reference-chip-preview${image ? " is-image" : ""}`}>{icon}</span>
      <span className="desktop-agent-reference-chip-copy">
        <span>{reference.displayName}</span>
        {statusLabel && <small>{statusLabel}</small>}
      </span>
      {onRetry && <button type="button" aria-label={t("agent.reference.retry", { name: bidiIsolate(reference.displayName) })} onClick={onRetry}><RefreshCcw size={10} aria-hidden="true" /></button>}
      <button type="button" aria-label={t("agent.reference.remove", { name: bidiIsolate(reference.displayName) })} onClick={onRemove}><X size={10} aria-hidden="true" /></button>
    </span>
  );
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
]);

function localizedReferenceError(reference: AgentDraftReference, t: MessageFormatter) {
  const code = reference.error?.code;
  if (code && LOCALIZED_REFERENCE_ERROR_CODES.has(code)) return t(`agent.reference.error.${code}`);
  return reference.error?.message || t("agent.reference.failed");
}
