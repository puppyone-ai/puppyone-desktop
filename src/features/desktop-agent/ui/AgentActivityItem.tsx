import type { AgentActivity } from "../domain/agent-projection-types";
import { agentActivityToolId } from "../domain/agent-activity-presentation";
import {
  AgentCommandActivity,
  AgentFileChangeActivity,
  AgentFileQueryActivity,
  AgentGenericActivity,
  AgentNoticeActivity,
  AgentPlanActivity,
  AgentReasoningActivity,
} from "./activity";

type AgentActivityItemProps = {
  activity: AgentActivity;
  onOpenFile?: (path: string) => void;
};

export function AgentActivityItem({ activity, onOpenFile }: AgentActivityItemProps) {
  if (activity.kind === "command") return <AgentCommandActivity activity={activity} />;
  if (activity.kind === "file-change") return <AgentFileChangeActivity activity={activity} onOpenFile={onOpenFile} />;
  if (activity.kind === "reasoning") return <AgentReasoningActivity activity={activity} />;
  if (activity.kind === "plan") return <AgentPlanActivity activity={activity} />;
  if (activity.kind === "warning" || activity.kind === "error") return <AgentNoticeActivity activity={activity} />;
  if (["read", "grep", "glob", "search", "list"].includes(agentActivityToolId(activity))) {
    return <AgentFileQueryActivity activity={activity} onOpenFile={onOpenFile} />;
  }
  return <AgentGenericActivity activity={activity} />;
}
