import { FileSearch, FolderSearch, Globe2, Search, Wrench } from "lucide-react";
import { useLocalization } from "@puppyone/localization/react";
import {
  agentActivitySummary,
  agentActivityToolId,
  formatAgentActivityLabel,
  formatAgentToolName,
  isContextCompactionActivity,
  outputForActivity,
  structuredInputForActivity,
} from "../../domain/agent-activity-presentation";
import type { AgentActivity } from "../../domain/agent-projection-types";
import { AgentActivityShell } from "./AgentActivityShell";

export function AgentGenericActivity({ activity }: { activity: AgentActivity }) {
  const { t } = useLocalization();
  if (isContextCompactionActivity(activity)) {
    return (
      <div className="desktop-agent-context-divider" role="status" aria-label={t("agent.activity.contextCompacted")}>
        <span aria-hidden="true" />
        <small>{t("agent.activity.contextCompacted")}</small>
        <span aria-hidden="true" />
      </div>
    );
  }
  const tool = agentActivityToolId(activity);
  const output = outputForActivity(activity);
  const input = structuredInputForActivity(activity);
  const detail = output || input;
  return (
    <AgentActivityShell
      title={formatAgentToolName(tool, t)}
      summary={agentActivitySummary(activity) || formatAgentActivityLabel(activity, t)}
      status={activity.status}
      icon={iconFor(tool)}
      className="desktop-agent-generic-tool"
    >
      {detail && <pre className="desktop-agent-tool-output">{detail}</pre>}
    </AgentActivityShell>
  );
}

function iconFor(tool: string) {
  if (tool === "read") return <FileSearch size={13} />;
  if (tool === "glob" || tool === "list") return <FolderSearch size={13} />;
  if (tool === "grep" || tool === "search") return <Search size={13} />;
  if (tool === "fetch") return <Globe2 size={13} />;
  return <Wrench size={13} />;
}
