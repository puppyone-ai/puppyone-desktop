import type { AgentTranscriptMessage } from "./agentProjection";
import { SafeMarkdown } from "./components/SafeMarkdown";

type AgentMessageProps = {
  message: AgentTranscriptMessage;
  runtimeLabel?: string;
};

export function AgentMessage({ message, runtimeLabel = "Agent" }: AgentMessageProps) {
  return (
    <article className={`desktop-agent-message is-${message.role}`}>
      <div className="desktop-agent-message-role">{message.role === "user" ? "You" : runtimeLabel}</div>
      {message.role === "assistant"
        ? <SafeMarkdown text={message.text || (message.streaming ? "…" : "")} streaming={message.streaming} />
        : <div className="desktop-agent-message-text">{message.text}</div>}
      {message.terminalState && message.terminalState !== "completed" && (
        <div className={`desktop-agent-message-state is-${message.terminalState}`}>
          {message.terminalState}
        </div>
      )}
    </article>
  );
}
