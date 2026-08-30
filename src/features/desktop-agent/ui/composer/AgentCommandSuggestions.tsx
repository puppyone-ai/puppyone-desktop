import { useLocalization } from "@puppyone/localization/react";
import type { AgentCommand } from "../../domain/agent-contract";

type AgentCommandSuggestionsProps = {
  commands: AgentCommand[];
  onSelect: (command: AgentCommand) => void;
};

export function AgentCommandSuggestions({ commands, onSelect }: AgentCommandSuggestionsProps) {
  const { t } = useLocalization();
  if (commands.length === 0) return null;
  return (
    <div
      className="desktop-agent-command-menu"
      data-po-scrollbar="content"
      role="listbox"
      aria-label={t("agent.composer.commands")}
    >
      {commands.map((command) => (
        <button
          type="button"
          role="option"
          aria-selected="false"
          key={`${command.source}:${command.name}`}
          onClick={() => onSelect(command)}
        >
          <strong>/{command.name}</strong><span>{command.description}</span>
        </button>
      ))}
    </div>
  );
}

export function visibleAgentCommands(draft: string, commands: AgentCommand[]) {
  const query = /^\/([^\s]*)$/.exec(draft.trimStart())?.[1]?.toLowerCase() ?? null;
  if (query === null) return [];
  return commands
    .filter((command) => command.name.toLowerCase().includes(query))
    .slice(0, 8);
}
