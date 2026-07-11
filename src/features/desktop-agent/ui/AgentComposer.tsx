import { ArrowUp, AtSign, ChevronDown, Paperclip, Plus, Sparkles, Square, X, Zap } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { AgentCommand, AgentFileReference, AgentMode, AgentModel } from "../domain/agent-contract";

type AgentComposerProps = {
  draft: string;
  onDraftChange: (draft: string) => void;
  disabled: boolean;
  running: boolean;
  stopping: boolean;
  submitting: boolean;
  placeholder: string;
  runtimeLabel?: string;
  models?: AgentModel[];
  selectedModel?: string | null;
  onSelectModel?: (model: string) => void;
  modes?: AgentMode[];
  selectedMode?: string | null;
  onSelectMode?: (mode: string) => void;
  commands?: AgentCommand[];
  attachments?: AgentFileReference[];
  contextReferences?: AgentFileReference[];
  attachmentAvailable?: boolean;
  contextAvailable?: boolean;
  steerAvailable?: boolean;
  queueAvailable?: boolean;
  onAddAttachments?: (references: AgentFileReference[]) => void;
  onAddContext?: (references: AgentFileReference[]) => void;
  onRemoveAttachment?: (path: string) => void;
  onRemoveContext?: (path: string) => void;
  onSubmit: (prompt: string) => Promise<boolean>;
  onStop: () => void;
};

const MAX_TEXTAREA_HEIGHT = 168;

export function AgentComposer({
  draft,
  onDraftChange,
  disabled,
  running,
  stopping,
  submitting,
  placeholder,
  runtimeLabel = "Agent",
  models = [],
  selectedModel = null,
  onSelectModel,
  modes = [],
  selectedMode = null,
  onSelectMode,
  commands = [],
  attachments = [],
  contextReferences = [],
  attachmentAvailable = false,
  contextAvailable = false,
  steerAvailable = false,
  queueAvailable = false,
  onAddAttachments,
  onAddContext,
  onRemoveAttachment,
  onRemoveContext,
  onSubmit,
  onStop,
}: AgentComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pickMode, setPickMode] = useState<"attachment" | "context">("attachment");
  const commandQuery = /^\/([^\s]*)$/.exec(draft.trimStart())?.[1]?.toLowerCase() ?? null;
  const visibleCommands = commandQuery === null ? [] : commands
    .filter((command) => command.name.toLowerCase().includes(commandQuery))
    .slice(0, 8);
  const canSendWhileRunning = steerAvailable || queueAvailable;
  const selectedModelEntry = useMemo(
    () => models.find((model) => model.model === selectedModel) ?? models[0] ?? null,
    [models, selectedModel],
  );

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    const nextHeight = Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > MAX_TEXTAREA_HEIGHT ? "auto" : "hidden";
  }, [draft]);

  const submit = async () => {
    const prompt = draft.trim();
    if (!prompt || disabled || (running && !canSendWhileRunning) || submitting) return;
    if (await onSubmit(prompt)) onDraftChange("");
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void submit();
  };
  const openPicker = (mode: "attachment" | "context") => {
    setPickMode(mode);
    fileInputRef.current?.click();
  };
  const acceptFiles = (files: FileList | null) => {
    const bridge = window.puppyoneDesktop;
    const references = Array.from(files ?? []).flatMap((file) => {
      const path = bridge?.getPathForFile?.(file);
      return path ? [{ path, name: file.name }] : [];
    });
    if (pickMode === "context") onAddContext?.(references);
    else onAddAttachments?.(references);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="desktop-agent-composer-shell">
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
        <textarea
          ref={textareaRef}
          value={draft}
          disabled={disabled}
          rows={1}
          aria-label={`Message ${runtimeLabel}`}
          placeholder={placeholder}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <input ref={fileInputRef} className="desktop-agent-visually-hidden" type="file" multiple tabIndex={-1} onChange={(event) => acceptFiles(event.target.files)} />
        <div className="desktop-agent-composer-footer">
          <div className="desktop-agent-composer-leading">
            {attachmentAvailable && <button type="button" className="desktop-agent-composer-tool" aria-label="Attach files" title="Attach files" disabled={disabled || running} onClick={() => openPicker("attachment")}><Plus size={18} /></button>}
            {contextAvailable && <button type="button" className="desktop-agent-composer-tool" aria-label="Add workspace context" title="Add workspace context" disabled={disabled || running} onClick={() => openPicker("context")}><AtSign size={16} /></button>}
            <div className="desktop-agent-select-pill is-mode">
              <Sparkles size={13} aria-hidden="true" />
              {modes.length > 0 ? (
                <label>
                  <span className="desktop-agent-visually-hidden">Agent mode</span>
                  <select value={selectedMode ?? ""} disabled={running} onChange={(event) => onSelectMode?.(event.target.value)}>
                    {modes.map((mode) => <option key={mode.id} value={mode.id}>{mode.displayName}</option>)}
                  </select>
                </label>
              ) : <span>Agent</span>}
              {modes.length > 0 && <ChevronDown size={12} aria-hidden="true" />}
            </div>
          </div>
          <div className="desktop-agent-composer-trailing">
            {models.length > 0 && (
              <div className="desktop-agent-select-pill is-model" title={selectedModelEntry?.description || selectedModelEntry?.displayName}>
                <Zap size={13} fill="currentColor" aria-hidden="true" />
                <label>
                  <span className="desktop-agent-visually-hidden">Agent model</span>
                  <select value={selectedModel ?? ""} disabled={running} onChange={(event) => onSelectModel?.(event.target.value)}>
                    {models.map((model) => <option key={model.id} value={model.model}>{model.displayName}</option>)}
                  </select>
                </label>
                <ChevronDown size={12} aria-hidden="true" />
              </div>
            )}
            {running && <button type="button" className="desktop-agent-composer-action is-stop" aria-label={stopping ? `Stopping ${runtimeLabel}` : `Stop ${runtimeLabel}`} disabled={stopping} onClick={onStop}><Square size={11} fill="currentColor" /></button>}
            {(!running || canSendWhileRunning) && <button type="button" className="desktop-agent-composer-action" aria-label={running && steerAvailable ? `Steer ${runtimeLabel}` : "Send message"} disabled={disabled || submitting || !draft.trim()} onClick={() => void submit()}><ArrowUp size={17} strokeWidth={2.2} /></button>}
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
