import type { ReactNode } from "react";
import { bidiIsolate } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import type {
  AgentCommand,
  AgentDraftReference,
  AgentModel,
  AgentPromptReferenceMention,
  AgentReferenceInputCapabilities,
} from "../domain/agent-contract";
import { AgentCommandSuggestions, visibleAgentCommands } from "./composer/AgentCommandSuggestions";
import { AgentComposerToolbar } from "./composer/AgentComposerToolbar";
import { AgentDraftReferenceList } from "./composer/AgentDraftReferenceList";
import { AgentPromptEditor } from "./composer/AgentPromptEditor";
import { useAgentComposerFocus } from "./composer/useAgentComposerFocus";
import { isAgentMediaReference } from "../domain/agent-prompt-mentions";

type AgentComposerProps = {
  draft: string;
  draftMentions?: AgentPromptReferenceMention[];
  onDraftChange: (draft: string) => void;
  onDraftDocumentChange?: (draft: string, mentions: AgentPromptReferenceMention[]) => void;
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
  onPaste?: (event: { clipboardData: DataTransfer; preventDefault: () => void; defaultPrevented: boolean }) => void;
  onSubmit: (prompt: string) => Promise<boolean>;
  onStop: () => void;
};

export const DEFAULT_AGENT_COMPOSER_PLACEHOLDER_ID = "agent.composer.placeholder.default";

export function AgentComposer({
  draft,
  draftMentions = [],
  onDraftChange,
  onDraftDocumentChange,
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
  const { promptEditorRef, handleSurfaceMouseDown } = useAgentComposerFocus(inputDisabled);
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
    await onSubmit(draft);
  };
  const updateDraftDocument = (nextDraft: string, nextMentions: AgentPromptReferenceMention[]) => {
    if (onDraftDocumentChange) onDraftDocumentChange(nextDraft, nextMentions);
    else onDraftChange(nextDraft);
  };
  // Failed inputs stay actionable while successful files live only in the prompt.
  const mediaReferences = references.filter((reference) => isAgentMediaReference(reference) || reference.status === "error");
  return (
    <div className="desktop-agent-composer-shell">
      {floatingAccessory && visibleCommands.length === 0 && (
        <div className="desktop-agent-composer-floating">{floatingAccessory}</div>
      )}
      <AgentCommandSuggestions
        commands={visibleCommands}
        onSelect={(command) => updateDraftDocument(`/${command.name} `, [])}
      />
      <div
        className="desktop-agent-composer"
        data-input-disabled={inputDisabled || undefined}
        onMouseDown={handleSurfaceMouseDown}
      >
        <div className="desktop-agent-composer-row">
          <div className="desktop-agent-composer-input-row">
            <AgentDraftReferenceList
              references={mediaReferences}
              getPreviewUrl={getReferencePreviewUrl}
              onRemove={onRemoveReference}
              onRetry={onRetryReference}
            />
            <div className="desktop-agent-prompt-editor-host">
              <AgentPromptEditor
                ref={promptEditorRef}
                value={draft}
                mentions={draftMentions}
                references={references}
                disabled={inputDisabled}
                placeholder={resolvedPlaceholder}
                ariaLabel={t("agent.composer.message", { agent: bidiIsolate(runtimeLabel) })}
                onChange={updateDraftDocument}
                onRemoveReference={onRemoveReference}
                onPaste={onPaste}
                onSubmit={() => void submit()}
              />
            </div>
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
