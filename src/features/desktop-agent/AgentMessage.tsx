import type { AgentTranscriptMessage } from "./agentProjection";

type AgentMessageProps = {
  message: AgentTranscriptMessage;
};

export function AgentMessage({ message }: AgentMessageProps) {
  return (
    <article className={`desktop-agent-message is-${message.role}`}>
      <div className="desktop-agent-message-role">{message.role === "user" ? "You" : "Codex"}</div>
      <div className="desktop-agent-message-text">{message.text || (message.streaming ? "…" : "")}</div>
      {message.terminalState && message.terminalState !== "completed" && (
        <div className={`desktop-agent-message-state is-${message.terminalState}`}>
          {message.terminalState}
        </div>
      )}
    </article>
  );
}
