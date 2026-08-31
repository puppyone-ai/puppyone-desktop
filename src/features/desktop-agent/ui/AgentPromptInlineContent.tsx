import type { AgentPromptReferenceMention } from "../domain/agent-contract";
import { splitAgentPromptMentions } from "../domain/agent-prompt-mentions";

export function AgentPromptInlineContent({ text, mentions = [] }: {
  text: string;
  mentions?: AgentPromptReferenceMention[];
}) {
  return (
    <div className="desktop-agent-message-text">
      {splitAgentPromptMentions(text, mentions).map((part, index) => part.kind === "mention"
        ? <span className="desktop-agent-history-mention" data-reference-id={part.mention.referenceId} key={`${part.mention.referenceId}:${part.mention.start}`}>{part.text}</span>
        : <span key={`text:${index}`}>{part.text}</span>)}
    </div>
  );
}
