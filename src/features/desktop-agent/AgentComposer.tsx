import { ArrowUp, Square } from "lucide-react";
import type { KeyboardEvent } from "react";

type AgentComposerProps = {
  draft: string;
  onDraftChange: (draft: string) => void;
  disabled: boolean;
  running: boolean;
  stopping: boolean;
  submitting: boolean;
  placeholder: string;
  onSubmit: (prompt: string) => Promise<boolean>;
  onStop: () => void;
};

export function AgentComposer({
  draft,
  onDraftChange,
  disabled,
  running,
  stopping,
  submitting,
  placeholder,
  onSubmit,
  onStop,
}: AgentComposerProps) {
  const submit = async () => {
    const prompt = draft.trim();
    if (!prompt || disabled || running || submitting) return;
    if (await onSubmit(prompt)) onDraftChange("");
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void submit();
  };
  return (
    <div className="desktop-agent-composer">
      <textarea
        value={draft}
        disabled={disabled}
        rows={2}
        aria-label="Message Codex"
        placeholder={placeholder}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      {running ? (
        <button
          type="button"
          className="desktop-agent-composer-action is-stop"
          aria-label={stopping ? "Stopping Codex" : "Stop Codex"}
          disabled={stopping}
          onClick={onStop}
        >
          <Square size={13} fill="currentColor" />
        </button>
      ) : (
        <button
          type="button"
          className="desktop-agent-composer-action"
          aria-label="Send message to Codex"
          disabled={disabled || submitting || !draft.trim()}
          onClick={() => void submit()}
        >
          <ArrowUp size={16} />
        </button>
      )}
      <div className="desktop-agent-composer-hint">{stopping ? "Waiting for Codex to stop…" : "Enter to send · Shift+Enter for a new line"}</div>
    </div>
  );
}
