import type { AgentPart } from "../domain/agent-projection-types";
import { useLocalization } from "@puppyone/localization/react";
import { SafeMarkdown } from "./SafeMarkdown";

type AgentMessagePartProps = {
  part: Extract<AgentPart, { kind: "user" | "assistant" }>;
  runtimeLabel: string;
};

/**
 * Conversation content has a different visual contract from work evidence:
 * user prompts are quiet full-width rows; Agent answers stay in the document flow.
 */
export function AgentMessagePart({ part, runtimeLabel }: AgentMessagePartProps) {
  const { t } = useLocalization();
  const isAssistant = part.kind === "assistant";
  return (
    <article
      className={`desktop-agent-message is-${part.kind}`}
      aria-label={isAssistant ? runtimeLabel : t("agent.message.you")}
      aria-busy={isAssistant && part.streaming ? true : undefined}
      data-message-surface={isAssistant ? "document" : "row"}
    >
      {isAssistant
        ? <SafeMarkdown text={part.text || (part.streaming ? "…" : "")} streaming={part.streaming} />
        : <div className="desktop-agent-message-text">{part.text}</div>}
      {isAssistant && part.terminalState && part.terminalState !== "completed" && (
        <footer className="desktop-agent-message-status">
          <span className={`desktop-agent-message-state is-${part.terminalState}`}>{t(`agent.turn.status.${part.terminalState}`)}</span>
        </footer>
      )}
    </article>
  );
}
