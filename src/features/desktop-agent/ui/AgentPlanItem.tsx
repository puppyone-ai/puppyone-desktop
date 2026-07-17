type PlanStep = {
  step: string;
  status: string;
};

type AgentPlanItemProps = {
  steps: PlanStep[];
};

export function AgentPlanItem({ steps }: AgentPlanItemProps) {
  const { t } = useLocalization();
  if (steps.length === 0) return null;
  return (
    <ol className="desktop-agent-plan-list">
      {steps.map((step, index) => (
        <li key={`${step.step}:${index}`} className={`desktop-agent-plan-step is-${step.status}`}>
          <span>{step.step}</span>
          <small>{formatPlanStatus(step.status, t)}</small>
        </li>
      ))}
    </ol>
  );
}

function formatPlanStatus(status: string, t: MessageFormatter) {
  if (status === "pending") return t("agent.plan.pending");
  if (status === "inProgress" || status === "in-progress" || status === "in_progress") return t("agent.plan.inProgress");
  if (status === "completed") return t("agent.plan.completed");
  return status;
}
import type { MessageFormatter } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
