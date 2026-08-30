import { ArrowUp, LoaderCircle, Square } from "lucide-react";
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
import { AgentAttachmentButton } from "./composer/AgentAttachmentButton";
import { AgentCommandSuggestions, visibleAgentCommands } from "./composer/AgentCommandSuggestions";
import { AgentDraftReferenceList } from "./composer/AgentDraftReferenceList";

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
  const visibleCommands = visibleAgentCommands(draft, commands);
  const canSendWhileRunning = steerAvailable || queueAvailable;
  const referencesReady = references.every((reference) => reference.status === "ready");
  const hasSubmission = Boolean(draft.trim()) || Boolean(references.length && referenceCapabilities?.attachmentOnly);
  const canSubmit = hasSubmission && referencesReady && !disabled && !submitting && (!running || canSendWhileRunning);
  const primaryActionLabel = running
    ? t(stopping ? "agent.composer.stopping" : "agent.composer.stop", { agent: bidiIsolate(runtimeLabel) })
    : t("agent.composer.send");
  const primaryActionBusy = running ? stopping : submitting;
  const primaryActionDisabled = running ? stopping : !canSubmit;

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
      <AgentCommandSuggestions
        commands={visibleCommands}
        onSelect={(command) => onDraftChange(`/${command.name} `)}
      />
      <div
        className="desktop-agent-composer"
        data-input-disabled={inputDisabled || undefined}
        onMouseDown={handleSurfaceMouseDown}
      >
        <div className="desktop-agent-composer-row">
          <div className="desktop-agent-composer-input-row">
            <textarea
              ref={textareaRef}
              data-po-scrollbar="content"
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
            <AgentDraftReferenceList
              references={references}
              onRemove={onRemoveReference}
              onRetry={onRetryReference}
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
              <AgentAttachmentButton
                capabilities={referenceCapabilities}
                disabled={inputDisabled || configurationDisabled}
                onAddExternalFiles={onAddExternalFiles}
                onPickWorkspaceReferences={onPickWorkspaceReferences}
              />
              <button
                type="button"
                className={`desktop-agent-composer-action${running ? " is-stop" : ""}`}
                aria-label={primaryActionLabel}
                aria-busy={primaryActionBusy || undefined}
                disabled={primaryActionDisabled}
                onClick={running ? onStop : () => void submit()}
              >
                {primaryActionBusy
                  ? <LoaderCircle size={15} className="desktop-agent-spin" />
                  : running
                    ? <Square size={11} fill="currentColor" />
                    : <ArrowUp size={17} strokeWidth={1.6} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
