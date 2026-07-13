import { ArrowUp, AtSign, LoaderCircle, Paperclip, Square, X } from "lucide-react";
import { useCallback, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import type { AgentCommand, AgentFileReference, AgentModel } from "../domain/agent-contract";
import { AgentModelPicker } from "./AgentModelPicker";

type AgentComposerProps = {
  draft: string;
  onDraftChange: (draft: string) => void;
  disabled: boolean;
  inputDisabled?: boolean;
  running: boolean;
  stopping: boolean;
  submitting: boolean;
  placeholder: string;
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

const TEXTAREA_LINE_HEIGHT = 20;
const MIN_TEXTAREA_HEIGHT = TEXTAREA_LINE_HEIGHT * 2;
const MAX_TEXTAREA_HEIGHT = TEXTAREA_LINE_HEIGHT * 6;
const ignoreSelection = () => {};

export function AgentComposer({
  draft,
  onDraftChange,
  disabled,
  inputDisabled = false,
  running,
  stopping,
  submitting,
  placeholder,
  floatingAccessory = null,
  runtimeLabel = "Agent",
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const commandQuery = /^\/([^\s]*)$/.exec(draft.trimStart())?.[1]?.toLowerCase() ?? null;
  const visibleCommands = commandQuery === null ? [] : commands
    .filter((command) => command.name.toLowerCase().includes(commandQuery))
    .slice(0, 8);
  const canSendWhileRunning = steerAvailable || queueAvailable;
  const resizeTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    if (!textarea.value) {
      textarea.style.height = `${MIN_TEXTAREA_HEIGHT}px`;
      textarea.style.overflowY = "hidden";
      return;
    }
    textarea.style.height = "0px";
    const scrollHeight = textarea.scrollHeight;
    const nextHeight = Math.max(MIN_TEXTAREA_HEIGHT, Math.min(scrollHeight, MAX_TEXTAREA_HEIGHT));
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = scrollHeight > MAX_TEXTAREA_HEIGHT ? "auto" : "hidden";
  }, []);

  useLayoutEffect(() => {
    resizeTextarea();
  }, [draft, resizeTextarea]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    let lastWidth = textarea.parentElement?.getBoundingClientRect().width ?? 0;
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(([entry]) => {
      if (!entry || Math.abs(entry.contentRect.width - lastWidth) < 1) return;
      lastWidth = entry.contentRect.width;
      resizeTextarea();
    }) : null;
    if (textarea.parentElement) observer?.observe(textarea.parentElement);
    return () => observer?.disconnect();
  }, [resizeTextarea]);

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
  return (
    <div className="desktop-agent-composer-shell">
      {floatingAccessory && visibleCommands.length === 0 && (
        <div className="desktop-agent-composer-floating">{floatingAccessory}</div>
      )}
      {visibleCommands.length > 0 && (
        <div className="desktop-agent-command-menu" role="listbox" aria-label="Agent commands">
          {visibleCommands.map((command) => (
            <button type="button" role="option" key={`${command.source}:${command.name}`} onClick={() => onDraftChange(`/${command.name} `)}>
              <strong>/{command.name}</strong><span>{command.description}</span>
            </button>
          ))}
        </div>
      )}
      <div className="desktop-agent-composer">
        {(attachments.length > 0 || contextReferences.length > 0) && (
          <div className="desktop-agent-reference-chips">
            {contextReferences.map((reference) => <span key={`context:${reference.path}`}><AtSign size={11} />{reference.name || basename(reference.path)}<button type="button" aria-label={`Remove ${reference.name || reference.path}`} onClick={() => onRemoveContext?.(reference.path)}><X size={10} /></button></span>)}
            {attachments.map((reference) => <span key={`attachment:${reference.path}`}><Paperclip size={11} />{reference.name || basename(reference.path)}<button type="button" aria-label={`Remove ${reference.name || reference.path}`} onClick={() => onRemoveAttachment?.(reference.path)}><X size={10} /></button></span>)}
          </div>
        )}
        <div className="desktop-agent-composer-row">
          <div className="desktop-agent-composer-input-row">
            <textarea
              ref={textareaRef}
              value={draft}
              disabled={inputDisabled}
              rows={1}
              aria-label={`Message ${runtimeLabel}`}
              placeholder={placeholder}
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
          <div className="desktop-agent-composer-trailing">
            {models.length > 0 && (
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
              {running && <button type="button" className="desktop-agent-composer-action is-stop" aria-label={stopping ? `Stopping ${runtimeLabel}` : `Stop ${runtimeLabel}`} disabled={stopping} onClick={onStop}><Square size={11} fill="currentColor" /></button>}
              {(!running || canSendWhileRunning) && <button type="button" className="desktop-agent-composer-action" aria-label={running && steerAvailable ? `Steer ${runtimeLabel}` : "Send message"} aria-busy={submitting || undefined} disabled={disabled || submitting || !draft.trim()} onClick={() => void submit()}>{submitting ? <LoaderCircle size={15} className="desktop-agent-spin" /> : <ArrowUp size={17} strokeWidth={2.2} />}</button>}
            </div>
          </div>
        </div>
      </div>
      {(stopping || (running && canSendWhileRunning)) && (
        <div className="desktop-agent-composer-hint" role="status">
          {stopping ? `Waiting for ${runtimeLabel} to stop…` : steerAvailable ? "Send to steer the running turn" : "Send to queue a follow-up"}
        </div>
      )}
    </div>
  );
}

function basename(path: string) {
  return path.split(/[\\/]/).filter(Boolean).at(-1) || path;
}
