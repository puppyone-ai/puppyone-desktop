import { FileSearch, FolderSearch, ListTree, Search, TerminalSquare } from "lucide-react";
import { useLocalization } from "@puppyone/localization/react";
import {
  commandForActivity,
  commandPresentationForActivity,
  formatAgentToolName,
  outputForActivity,
} from "../../domain/agent-activity-presentation";
import type { AgentActivity } from "../../domain/agent-projection-types";
import { AgentActivityShell } from "./AgentActivityShell";
import { AgentToolEvidenceNode, AgentToolEvidenceTree } from "./AgentToolEvidenceTree";
import { AgentToolTextEvidence } from "./AgentToolTextEvidence";

export function AgentCommandActivity({ activity }: { activity: AgentActivity }) {
  const { t } = useLocalization();
  const command = commandForActivity(activity);
  const output = outputForActivity(activity);
  const presentation = commandPresentationForActivity(activity);
  return (
    <AgentActivityShell
      title={formatAgentToolName(presentation.tool, t)}
      status={activity.status}
      icon={commandIcon(presentation.tool)}
      className={`desktop-agent-command is-${presentation.tool}`}
    >
      {(command || output) && (
        <AgentToolEvidenceTree>
          {command && (
            <AgentToolEvidenceNode kind="command" marker="$">
              <AgentToolTextEvidence text={command} className="desktop-agent-command-line" />
            </AgentToolEvidenceNode>
          )}
          {output && (
            <AgentToolEvidenceNode kind="result">
              <AgentToolTextEvidence text={output} className="desktop-agent-command-output" />
            </AgentToolEvidenceNode>
          )}
        </AgentToolEvidenceTree>
      )}
    </AgentActivityShell>
  );
}

function commandIcon(tool: "bash" | "read" | "grep" | "glob" | "list") {
  if (tool === "read") return <FileSearch size={13} />;
  if (tool === "grep") return <Search size={13} />;
  if (tool === "glob") return <FolderSearch size={13} />;
  if (tool === "list") return <ListTree size={13} />;
  return <TerminalSquare size={13} />;
}
