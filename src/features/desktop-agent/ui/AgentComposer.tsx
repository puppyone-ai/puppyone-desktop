import { ArrowUp, CircleAlert, File, Folder, Image, LoaderCircle, Paperclip, RefreshCcw, Square, X } from "lucide-react";
import { useRef, type ClipboardEventHandler, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { bidiIsolate } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import type {
  AgentCommand,
  AgentDraftReference,
  AgentModel,
  AgentReferenceInputCapabilities,
} from "../domain/agent-contract";
import { AgentModelPicker } from "./AgentModelPicker";
import { AgentReferenceMenu } from "./AgentReferenceMenu";

type AgentComposerProps = {
  draft: string;
  onDraftChange: (draft: string) => void;
  disabled: boolean;
  hideConfiguration?: boolean;
  inputDisabled?: boolean;
  running: boolean;
  stopping: boolean;
  submitting: boolean;
  placeholder?: string;
  floatingAccessory?: ReactNode;
  runtimeLabel?: string;
  configurationDisabled?: boolean;
  models?: AgentModel[];
  selectedModel?: string | null;
  onSelectModel?: (model: string) => void;
  commands?: AgentCommand[];
  references?: AgentDraftReference[];
  referenceCapabilities?: AgentReferenceInputCapabilities;
  steerAvailable?: boolean;
  queueAvailable?: boolean;
  onRemoveReference?: (id: string) => void;
  onRetryReference?: (id: string) => void;
  onAddExternalFiles?: (files: File[]) => void;
  onPickWorkspaceReferences?: () => void;
  onPaste?: ClipboardEventHandler<HTMLTextAreaElement>;
  onSubmit: (prompt: string) => Promise<boolean>;
  onStop: () => void;
};

export const DEFAULT_AGENT_COMPOSER_PLACEHOLDER_ID = "agent.composer.placeholder.default";
const ignoreSelection = () => {};
const COMPOSER_CONTROL_SELECTOR = "textarea, button, a[href], input, select, [role='button'], [role='option'], [contenteditable='true']";

export function AgentComposer({
  draft,
  onDraftChange,
  disabled,
  hideConfiguration = false,
  inputDisabled = false,
  running,
  stopping,
  submitting,
  placeholder = "",
  floatingAccessory = null,
  runtimeLabel: runtimeLabelProp,
  configurationDisabled = false,
  models = [],
  selectedModel = null,
  onSelectModel,
  commands = [],
  references = [],
  referenceCapabilities,
  steerAvailable = false,
  queueAvailable = false,
  onRemoveReference,
  onRetryReference,
  onAddExternalFiles,
  onPickWorkspaceReferences,
  onPaste,
  onSubmit,
  onStop,
}: AgentComposerProps) {
  const { t } = useLocalization();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const runtimeLabel = runtimeLabelProp || t("agent.name");
  const resolvedPlaceholder = placeholder.trim() || t(DEFAULT_AGENT_COMPOSER_PLACEHOLDER_ID);
  const commandQuery = /^\/([^\s]*)$/.exec(draft.trimStart())?.[1]?.toLowerCase() ?? null;
  const visibleCommands = commandQuery === null ? [] : commands
    .filter((command) => command.name.toLowerCase().includes(commandQuery))
    .slice(0, 8);
  const canSendWhileRunning = steerAvailable || queueAvailable;
  const referencesReady = references.every((reference) => reference.status === "ready");
  const hasSubmission = Boolean(draft.trim()) || Boolean(references.length && referenceCapabilities?.attachmentOnly);
  const canSubmit = hasSubmission && referencesReady && !disabled && !submitting && (!running || canSendWhileRunning);

  const submit = async () => {
    if (!canSubmit) return;
    await onSubmit(draft.trim());
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void submit();
  };
  const handleSurfaceMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (inputDisabled || event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element) || target.closest(COMPOSER_CONTROL_SELECTOR)) return;
    event.preventDefault();
    textareaRef.current?.focus();
  };
  return (
    <div className="desktop-agent-composer-shell">
      {floatingAccessory && visibleCommands.length === 0 && (
        <div className="desktop-agent-composer-floating">{floatingAccessory}</div>
      )}
      {visibleCommands.length > 0 && (
        <div className="desktop-agent-command-menu" role="listbox" aria-label={t("agent.composer.commands")}>
          {visibleCommands.map((command) => (
            <button type="button" role="option" key={`${command.source}:${command.name}`} onClick={() => onDraftChange(`/${command.name} `)}>
              <strong>/{command.name}</strong><span>{command.description}</span>
            </button>
          ))}
        </div>
      )}
      <div
        className="desktop-agent-composer"
        data-input-disabled={inputDisabled || undefined}
        onMouseDown={handleSurfaceMouseDown}
      >
        {references.length > 0 && (
          <div className="desktop-agent-reference-chips" aria-label={t("agent.reference.selected")}>
            {references.map((reference) => (
              <ReferenceChip
                key={reference.id}
                reference={reference}
                onRemove={() => onRemoveReference?.(reference.id)}
                onRetry={reference.status === "error" ? () => onRetryReference?.(reference.id) : undefined}
              />
            ))}
          </div>
        )}
        <div className="desktop-agent-composer-row">
          <div className="desktop-agent-composer-input-row">
            <textarea
              ref={textareaRef}
              value={draft}
              disabled={inputDisabled}
              rows={1}
              aria-label={t("agent.composer.message", { agent: bidiIsolate(runtimeLabel) })}
              placeholder={resolvedPlaceholder}
              dir="auto"
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={onPaste}
            />
          </div>
          <div className="desktop-agent-composer-trailing">
            <div className="desktop-agent-composer-leading">
              {!hideConfiguration && models.length > 0 && (
                <div className="desktop-agent-composer-picker is-model">
                  <AgentModelPicker
                    models={models}
                    selectedModel={selectedModel}
                    disabled={running || configurationDisabled}
                    onSelectModel={onSelectModel ?? ignoreSelection}
                  />
                </div>
              )}
            </div>
            <div className="desktop-agent-composer-actions">
              <AgentReferenceMenu
                capabilities={referenceCapabilities}
                disabled={inputDisabled || configurationDisabled}
                onAddExternalFiles={onAddExternalFiles}
                onPickWorkspaceReferences={onPickWorkspaceReferences}
              />
              {running && <button type="button" className="desktop-agent-composer-action is-stop" aria-label={t(stopping ? "agent.composer.stopping" : "agent.composer.stop", { agent: bidiIsolate(runtimeLabel) })} disabled={stopping} onClick={onStop}><Square size={11} fill="currentColor" /></button>}
              {(!running || canSendWhileRunning) && <button type="button" className="desktop-agent-composer-action" aria-label={running && steerAvailable ? t("agent.composer.steer", { agent: bidiIsolate(runtimeLabel) }) : t("agent.composer.send")} aria-busy={submitting || undefined} disabled={!canSubmit} onClick={() => void submit()}>{submitting ? <LoaderCircle size={15} className="desktop-agent-spin" /> : <ArrowUp size={17} strokeWidth={2.2} />}</button>}
            </div>
          </div>
        </div>
      </div>
      {(stopping || (running && canSendWhileRunning)) && (
        <div className="desktop-agent-composer-hint" role="status">
          {stopping
            ? t("agent.composer.waitingToStop", { agent: bidiIsolate(runtimeLabel) })
            : steerAvailable
              ? t("agent.composer.steerHint")
              : t("agent.composer.queueHint")}
        </div>
      )}
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
  const rawError = reference.status === "error" ? reference.error?.message || "" : "";
  const details = [
    relativePath !== reference.displayName ? relativePath : "",
    statusLabel,
    rawError !== statusLabel ? rawError : "",
  ].filter(Boolean);
  return (
    <span
      className={`is-${reference.status}`}
      dir="auto"
      role="group"
      title={details.join("\n") || undefined}
      aria-label={[reference.displayName, ...details].join(": ")}
    >
      {icon}<span className="desktop-agent-reference-chip-copy">
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

function localizedReferenceError(
  reference: AgentDraftReference,
  t: ReturnType<typeof useLocalization>["t"],
) {
  const code = reference.error?.code;
  if (code && LOCALIZED_REFERENCE_ERROR_CODES.has(code)) return t(`agent.reference.error.${code}`);
  return reference.error?.message || t("agent.reference.failed");
}
