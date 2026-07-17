import { ArrowUp, AtSign, LoaderCircle, Paperclip, Square, X } from "lucide-react";
import { useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { bidiIsolate } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import type { AgentCommand, AgentFileReference, AgentModel } from "../domain/agent-contract";
import { AgentModelPicker } from "./AgentModelPicker";

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
  attachments?: AgentFileReference[];
  contextReferences?: AgentFileReference[];
  steerAvailable?: boolean;
  queueAvailable?: boolean;
  onRemoveAttachment?: (path: string) => void;
  onRemoveContext?: (path: string) => void;
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
  attachments = [],
  contextReferences = [],
  steerAvailable = false,
  queueAvailable = false,
  onRemoveAttachment,
  onRemoveContext,
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

  const submit = async () => {
    const prompt = draft.trim();
    if (!prompt || disabled || (running && !canSendWhileRunning) || submitting) return;
    await onSubmit(prompt);
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
        {(attachments.length > 0 || contextReferences.length > 0) && (
          <div className="desktop-agent-reference-chips">
            {contextReferences.map((reference) => {
              const label = reference.name || basename(reference.path);
              return <span key={`context:${reference.path}`} dir="auto"><AtSign size={11} />{label}<button type="button" aria-label={t("agent.composer.removeContext", { name: bidiIsolate(label) })} onClick={() => onRemoveContext?.(reference.path)}><X size={10} /></button></span>;
            })}
            {attachments.map((reference) => {
              const label = reference.name || basename(reference.path);
              return <span key={`attachment:${reference.path}`} dir="auto"><Paperclip size={11} />{label}<button type="button" aria-label={t("agent.composer.removeAttachment", { name: bidiIsolate(label) })} onClick={() => onRemoveAttachment?.(reference.path)}><X size={10} /></button></span>;
            })}
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
            />
          </div>
          <div className="desktop-agent-composer-trailing">
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
            <div className="desktop-agent-composer-actions">
              {running && <button type="button" className="desktop-agent-composer-action is-stop" aria-label={t(stopping ? "agent.composer.stopping" : "agent.composer.stop", { agent: bidiIsolate(runtimeLabel) })} disabled={stopping} onClick={onStop}><Square size={11} fill="currentColor" /></button>}
              {(!running || canSendWhileRunning) && <button type="button" className="desktop-agent-composer-action" aria-label={running && steerAvailable ? t("agent.composer.steer", { agent: bidiIsolate(runtimeLabel) }) : t("agent.composer.send")} aria-busy={submitting || undefined} disabled={disabled || submitting || !draft.trim()} onClick={() => void submit()}>{submitting ? <LoaderCircle size={15} className="desktop-agent-spin" /> : <ArrowUp size={17} strokeWidth={2.2} />}</button>}
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

function basename(path: string) {
  return path.split(/[\\/]/).filter(Boolean).at(-1) || path;
}
