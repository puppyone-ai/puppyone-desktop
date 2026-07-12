import { Brain } from "lucide-react";
import { commandMetadata, outputForActivity } from "../../domain/agent-activity-presentation";
import type { AgentActivity } from "../../domain/agent-projection-types";
import { AgentActivityShell } from "./AgentActivityShell";

export function AgentReasoningActivity({ activity }: { activity: AgentActivity }) {
  const reasoning = typeof activity.detail.delta === "string" ? activity.detail.delta : outputForActivity(activity);
  const duration = commandMetadata(activity).duration;
  const running = ["running", "pending", "in-progress"].includes(activity.status);
  return (
    <AgentActivityShell
      title={running ? "Thinking" : duration ? `Thought for ${duration}` : "Thought briefly"}
      summary={running ? "Working through the request" : undefined}
      status={activity.status}
      icon={<Brain size={13} />}
      className="desktop-agent-reasoning"
    >
      {reasoning && <div className="desktop-agent-reasoning-copy">{reasoning}</div>}
    </AgentActivityShell>
  );
}
