import { CircleAlert, LoaderCircle } from "lucide-react";
import { useLocalization } from "@puppyone/localization/react";
import { formatAgentActivityLabel } from "../../domain/agent-activity-presentation";
import type { AgentActivity } from "../../domain/agent-projection-types";

export function AgentNoticeActivity({ activity }: { activity: AgentActivity }) {
  const { t } = useLocalization();
  const isConnectionRecovery = activity.kind === "warning" && activity.detail.recoverable === true;
  const Icon = isConnectionRecovery ? LoaderCircle : CircleAlert;
  return (
    <div className={`desktop-agent-notice is-${activity.kind}${isConnectionRecovery ? " is-connection" : ""}`} role={activity.kind === "error" ? "alert" : "status"}>
      <Icon className={isConnectionRecovery ? "desktop-agent-spin" : undefined} size={13} aria-hidden="true" />
      <span dir="auto">{formatAgentActivityLabel(activity, t)}</span>
    </div>
  );
}
