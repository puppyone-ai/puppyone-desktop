import { Brain } from "lucide-react";
import { outputForActivity } from "../../domain/agent-activity-presentation";
import type { AgentActivity } from "../../domain/agent-projection-types";
import { AgentActivityShell } from "./AgentActivityShell";

export function AgentReasoningActivity({ activity }: { activity: AgentActivity }) {
  const reasoning = typeof activity.detail.delta === "string" ? activity.detail.delta : outputForActivity(activity);
  return (
    <AgentActivityShell
      title="Thinking"
      summary={activity.status === "running" ? "Working through the request" : "Reasoning summary"}
      status={activity.status}
      icon={<Brain size={13} />}
      className="desktop-agent-reasoning"
    >
      {reasoning && <div className="desktop-agent-reasoning-copy">{reasoning}</div>}
    </AgentActivityShell>
  );
}
