import { useRef, type ClipboardEventHandler, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { bidiIsolate } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import type {
  AgentCommand,
  AgentDraftReference,
  AgentModel,
  AgentReferenceInputCapabilities,
} from "../domain/agent-contract";
import { AgentCommandSuggestions, visibleAgentCommands } from "./composer/AgentCommandSuggestions";
import { AgentComposerToolbar } from "./composer/AgentComposerToolbar";
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
  efforts?: string[];
  selectedEffort?: string | null;
  onSelectEffort?: (effort: string) => void;
  commands?: AgentCommand[];
  references?: AgentDraftReference[];
  getReferencePreviewUrl?: (id: string) => string | null;
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
  efforts = [],
  selectedEffort = null,
  onSelectEffort,
  commands = [],
  references = [],
  getReferencePreviewUrl,
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
            <AgentDraftReferenceList
              references={references}
              getPreviewUrl={getReferencePreviewUrl}
              onRemove={onRemoveReference}
              onRetry={onRetryReference}
            />
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
          </div>
          <AgentComposerToolbar
            hideConfiguration={hideConfiguration}
            inputDisabled={inputDisabled}
            configurationDisabled={configurationDisabled}
            running={running}
            models={models}
            selectedModel={selectedModel}
            onSelectModel={onSelectModel}
            efforts={efforts}
            selectedEffort={selectedEffort}
            onSelectEffort={onSelectEffort}
            referenceCapabilities={referenceCapabilities}
            onAddExternalFiles={onAddExternalFiles}
            onPickWorkspaceReferences={onPickWorkspaceReferences}
            primaryActionLabel={primaryActionLabel}
            primaryActionBusy={primaryActionBusy}
            primaryActionDisabled={primaryActionDisabled}
            onPrimaryAction={running ? onStop : () => void submit()}
          />
        </div>
      </div>
    </div>
  );
}
