import { ArrowUp, AtSign, Check, Paperclip, Plus, Sparkles, Square, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import type { AgentCommand, AgentFileReference, AgentInferenceProvider, AgentLocalConnection, AgentMode, AgentModel } from "../domain/agent-contract";
import { AgentModelPicker } from "./AgentModelPicker";
import { AgentProviderPicker } from "./AgentProviderPicker";

type AgentComposerProps = {
  draft: string;
  onDraftChange: (draft: string) => void;
  disabled: boolean;
  hideConfiguration?: boolean;
  inputDisabled?: boolean;
  running: boolean;
  stopping: boolean;
  submitting: boolean;
  placeholder: string;
  runtimeLabel?: string;
  providers?: AgentInferenceProvider[];
  selectedProviderId?: string | null;
  onSelectProvider?: (providerId: string) => void;
  localConnections?: AgentLocalConnection[];
  localConnectionsPhase?: "idle" | "loading" | "ready" | "error";
  localConnectionsError?: string | null;
  onDiscoverLocalConnections?: (refresh: boolean) => void | Promise<void>;
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
  resolveFilePath?: (file: File) => string | null;
  onSubmit: (prompt: string) => Promise<boolean>;
  onStop: () => void;
};

const MIN_TEXTAREA_HEIGHT = 20;
const MAX_TEXTAREA_HEIGHT = 132;

export function AgentComposer({
  draft,
  onDraftChange,
  disabled,
  hideConfiguration = false,
  inputDisabled = false,
  running,
  stopping,
  submitting,
  placeholder,
  runtimeLabel = "Agent",
  providers = [],
  selectedProviderId = null,
  onSelectProvider,
  localConnections = [],
  localConnectionsPhase = "idle",
  localConnectionsError = null,
  onDiscoverLocalConnections = () => undefined,
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
  resolveFilePath,
  onSubmit,
  onStop,
}: AgentComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const [pickMode, setPickMode] = useState<"attachment" | "context">("attachment");
  const [toolsOpen, setToolsOpen] = useState(false);
  const commandQuery = /^\/([^\s]*)$/.exec(draft.trimStart())?.[1]?.toLowerCase() ?? null;
  const visibleCommands = commandQuery === null ? [] : commands
    .filter((command) => command.name.toLowerCase().includes(commandQuery))
    .slice(0, 8);
  const canSendWhileRunning = steerAvailable || queueAvailable;
  const toolsAvailable = attachmentAvailable || contextAvailable || modes.length > 0;

  useEffect(() => {
    if (!toolsOpen) return undefined;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && toolsRef.current?.contains(event.target)) return;
      setToolsOpen(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setToolsOpen(false);
    };
    window.addEventListener("pointerdown", closeOnPointerDown, true);
    window.addEventListener("keydown", closeOnEscape, true);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointerDown, true);
      window.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [toolsOpen]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const resize = () => {
      if (!draft) {
        textarea.style.height = `${MIN_TEXTAREA_HEIGHT}px`;
        textarea.style.overflowY = "hidden";
        return;
      }
      textarea.style.height = "0px";
      const nextHeight = Math.max(MIN_TEXTAREA_HEIGHT, Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT));
      textarea.style.height = `${nextHeight}px`;
      textarea.style.overflowY = textarea.scrollHeight > MAX_TEXTAREA_HEIGHT ? "auto" : "hidden";
    };
    resize();
    let lastWidth = textarea.parentElement?.getBoundingClientRect().width ?? 0;
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(([entry]) => {
      if (!entry || Math.abs(entry.contentRect.width - lastWidth) < 1) return;
      lastWidth = entry.contentRect.width;
      resize();
    }) : null;
    if (textarea.parentElement) observer?.observe(textarea.parentElement);
    return () => observer?.disconnect();
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
    setToolsOpen(false);
    fileInputRef.current?.click();
  };
  const acceptFiles = (files: FileList | null) => {
    const references = Array.from(files ?? []).flatMap((file) => {
      const path = resolveFilePath?.(file);
      return path ? [{ path, name: file.name }] : [];
    });
    if (pickMode === "context") onAddContext?.(references);
    else onAddAttachments?.(references);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="desktop-agent-composer-shell">
      {visibleCommands.length > 0 && !toolsOpen && (
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
          <div className="desktop-agent-composer-leading" ref={toolsRef}>
            <button
              type="button"
              className="desktop-agent-composer-tool"
              aria-label="Add context or change Agent mode"
              title="Add context or change Agent mode"
              aria-haspopup="menu"
              aria-expanded={toolsOpen}
              disabled={!toolsAvailable || inputDisabled || running}
              onClick={() => setToolsOpen((value) => !value)}
            >
              <Plus size={18} />
            </button>
            {toolsOpen && (
              <div className="desktop-agent-tools-menu" role="menu" aria-label="Composer tools">
                {attachmentAvailable && <button type="button" role="menuitem" onClick={() => openPicker("attachment")}><Paperclip size={14} /><span>Attach files</span></button>}
                {contextAvailable && <button type="button" role="menuitem" onClick={() => openPicker("context")}><AtSign size={14} /><span>Add workspace context</span></button>}
                {modes.length > 0 && (
                  <div className="desktop-agent-tools-mode" role="group" aria-label="Agent mode">
                    <div><Sparkles size={13} /><span>Agent mode</span></div>
                    {modes.map((mode) => (
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={mode.id === selectedMode}
                        key={mode.id}
                        onClick={() => { onSelectMode?.(mode.id); setToolsOpen(false); }}
                      >
                        <span>{mode.displayName}</span>{mode.id === selectedMode && <Check size={13} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
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
          <input ref={fileInputRef} className="desktop-agent-visually-hidden" type="file" multiple tabIndex={-1} onChange={(event) => acceptFiles(event.target.files)} />
          <div className="desktop-agent-composer-trailing">
            {!hideConfiguration && (
              <>
                <div className="desktop-agent-composer-picker is-provider">
                  <AgentProviderPicker
                    providers={providers}
                    localConnections={localConnections}
                    localConnectionsPhase={localConnectionsPhase}
                    localConnectionsError={localConnectionsError}
                    selectedProviderId={selectedProviderId}
                    disabled={running}
                    onSelectProvider={(providerId) => onSelectProvider?.(providerId)}
                    onDiscoverLocalConnections={onDiscoverLocalConnections}
                  />
                </div>
                {selectedProviderId && models.length > 0 && (
                  <div className="desktop-agent-composer-picker is-model">
                    <AgentModelPicker
                      models={models}
                      selectedModel={selectedModel}
                      disabled={running}
                      onSelectModel={(model) => onSelectModel?.(model)}
                    />
                  </div>
                )}
              </>
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
