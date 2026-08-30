import { ArrowUp, LoaderCircle, Square } from "lucide-react";
import type { AgentModel, AgentReferenceInputCapabilities } from "../../domain/agent-contract";
import { AgentEffortPicker } from "../AgentEffortPicker";
import { AgentModelPicker } from "../AgentModelPicker";
import { AgentAttachmentButton } from "./AgentAttachmentButton";

type AgentComposerToolbarProps = {
  hideConfiguration: boolean;
  inputDisabled: boolean;
  configurationDisabled: boolean;
  running: boolean;
  models: AgentModel[];
  selectedModel: string | null;
  onSelectModel?: (model: string) => void;
  efforts: string[];
  selectedEffort: string | null;
  onSelectEffort?: (effort: string) => void;
  referenceCapabilities?: AgentReferenceInputCapabilities;
  onAddExternalFiles?: (files: File[]) => void;
  onPickWorkspaceReferences?: () => void;
  primaryActionLabel: string;
  primaryActionBusy: boolean;
  primaryActionDisabled: boolean;
  onPrimaryAction: () => void;
};

const ignoreSelection = () => {};

export function AgentComposerToolbar({
  hideConfiguration,
  inputDisabled,
  configurationDisabled,
  running,
  models,
  selectedModel,
  onSelectModel,
  efforts,
  selectedEffort,
  onSelectEffort,
  referenceCapabilities,
  onAddExternalFiles,
  onPickWorkspaceReferences,
  primaryActionLabel,
  primaryActionBusy,
  primaryActionDisabled,
  onPrimaryAction,
}: AgentComposerToolbarProps) {
  return (
    <div className="desktop-agent-composer-trailing">
      <div className="desktop-agent-composer-leading">
        <AgentAttachmentButton
          capabilities={referenceCapabilities}
          disabled={inputDisabled || configurationDisabled}
          onAddExternalFiles={onAddExternalFiles}
          onPickWorkspaceReferences={onPickWorkspaceReferences}
        />
      </div>
      <div className="desktop-agent-composer-actions">
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
        {!hideConfiguration && efforts.length > 0 && onSelectEffort && (
          <div className="desktop-agent-composer-picker is-effort">
            <AgentEffortPicker
              efforts={efforts}
              selectedEffort={selectedEffort}
              disabled={running || configurationDisabled}
              onSelectEffort={onSelectEffort}
            />
          </div>
        )}
        <button
          type="button"
          className={`desktop-agent-composer-action${running ? " is-stop" : ""}`}
          aria-label={primaryActionLabel}
          aria-busy={primaryActionBusy || undefined}
          disabled={primaryActionDisabled}
          onClick={onPrimaryAction}
        >
          {primaryActionBusy
            ? <LoaderCircle size={15} className="desktop-agent-spin" />
            : running
              ? <Square size={11} fill="currentColor" />
              : <ArrowUp size={17} strokeWidth={1.6} />}
        </button>
      </div>
    </div>
  );
}
