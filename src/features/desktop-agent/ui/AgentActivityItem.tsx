import type { AgentActivity } from "../domain/agent-projection-types";
import {
  AgentCommandActivity,
  AgentFileChangeActivity,
  AgentGenericActivity,
  AgentNoticeActivity,
  AgentPlanActivity,
  AgentReasoningActivity,
} from "./activity";

type AgentActivityItemProps = {
  activity: AgentActivity;
  onViewChanges?: () => void;
  onOpenTerminal?: () => void;
  onOpenFile?: (path: string) => void;
};

export function AgentActivityItem({ activity, onViewChanges, onOpenTerminal, onOpenFile }: AgentActivityItemProps) {
  if (activity.kind === "command") return <AgentCommandActivity activity={activity} onOpenTerminal={onOpenTerminal} />;
  if (activity.kind === "file-change") return <AgentFileChangeActivity activity={activity} onViewChanges={onViewChanges} onOpenFile={onOpenFile} />;
  if (activity.kind === "reasoning") return <AgentReasoningActivity activity={activity} />;
  if (activity.kind === "plan") return <AgentPlanActivity activity={activity} />;
  if (activity.kind === "warning" || activity.kind === "error") return <AgentNoticeActivity activity={activity} />;
  return <AgentGenericActivity activity={activity} onOpenFile={onOpenFile} />;
}
