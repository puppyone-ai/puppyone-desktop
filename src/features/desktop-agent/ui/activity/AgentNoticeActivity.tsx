import { CircleAlert } from "lucide-react";
import type { AgentActivity } from "../../domain/agent-projection-types";

export function AgentNoticeActivity({ activity }: { activity: AgentActivity }) {
  return (
    <div className={`desktop-agent-notice is-${activity.kind}`} role={activity.kind === "error" ? "alert" : "status"}>
      <CircleAlert size={13} aria-hidden="true" />
      <span>{activity.label}</span>
    </div>
  );
}
