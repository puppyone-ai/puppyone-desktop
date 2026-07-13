import { FileSearch, FolderSearch, Globe2, Search, Wrench } from "lucide-react";
import {
  agentActivitySummary,
  agentActivityToolName,
  isContextCompactionActivity,
  outputForActivity,
  structuredInputForActivity,
} from "../../domain/agent-activity-presentation";
import type { AgentActivity } from "../../domain/agent-projection-types";
import { AgentActivityShell } from "./AgentActivityShell";

export function AgentGenericActivity({ activity }: { activity: AgentActivity }) {
  if (isContextCompactionActivity(activity)) {
    return (
      <div className="desktop-agent-context-divider" role="status" aria-label="Context compacted">
        <span aria-hidden="true" />
        <small>Compacted context</small>
        <span aria-hidden="true" />
      </div>
    );
  }
  const tool = agentActivityToolName(activity);
  const output = outputForActivity(activity);
  const input = structuredInputForActivity(activity);
  const detail = output || input;
  return (
    <AgentActivityShell
      title={tool}
      summary={agentActivitySummary(activity)}
      status={activity.status}
      icon={iconFor(tool)}
      className="desktop-agent-generic-tool"
    >
      {detail && <pre className="desktop-agent-tool-output">{detail}</pre>}
    </AgentActivityShell>
  );
}

function iconFor(tool: string) {
  if (tool === "Read") return <FileSearch size={13} />;
  if (tool === "Glob" || tool === "List") return <FolderSearch size={13} />;
  if (tool === "Grep" || tool === "Search") return <Search size={13} />;
  if (tool === "Fetch") return <Globe2 size={13} />;
  return <Wrench size={13} />;
}
