import { Brain } from "lucide-react";
import { useLocalization } from "@puppyone/localization/react";
import { commandMetadata, formatAgentDuration, outputForActivity } from "../../domain/agent-activity-presentation";
import type { AgentActivity } from "../../domain/agent-projection-types";
import { AgentActivityShell } from "./AgentActivityShell";

export function AgentReasoningActivity({ activity }: { activity: AgentActivity }) {
  const { t, formatNumber } = useLocalization();
  const reasoning = typeof activity.detail.delta === "string" ? activity.detail.delta : outputForActivity(activity);
  const durationMs = commandMetadata(activity).durationMs;
  const duration = durationMs === null ? null : formatAgentDuration(durationMs, t, formatNumber);
  const running = ["running", "pending", "in-progress"].includes(activity.status);
  return (
    <AgentActivityShell
      title={running ? t("agent.activity.thinking") : duration ? t("agent.activity.thoughtFor", { duration }) : t("agent.activity.thoughtBriefly")}
      summary={running ? t("agent.activity.workingThroughRequest") : undefined}
      status={activity.status}
      icon={<Brain size={13} />}
      className="desktop-agent-reasoning"
    >
      {reasoning && <div className="desktop-agent-reasoning-copy">{reasoning}</div>}
    </AgentActivityShell>
  );
}
