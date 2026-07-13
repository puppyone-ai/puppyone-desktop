import { CircleAlert } from "lucide-react";
import { useLocalization } from "@puppyone/localization/react";
import { formatAgentActivityLabel } from "../../domain/agent-activity-presentation";
import type { AgentActivity } from "../../domain/agent-projection-types";

export function AgentNoticeActivity({ activity }: { activity: AgentActivity }) {
  const { t } = useLocalization();
  return (
    <div className={`desktop-agent-notice is-${activity.kind}`} role={activity.kind === "error" ? "alert" : "status"}>
      <CircleAlert size={13} aria-hidden="true" />
      <span dir="auto">{formatAgentActivityLabel(activity, t)}</span>
    </div>
  );
}
