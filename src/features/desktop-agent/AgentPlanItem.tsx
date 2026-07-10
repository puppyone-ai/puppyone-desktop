type PlanStep = {
  step: string;
  status: string;
};

type AgentPlanItemProps = {
  steps: PlanStep[];
};

const KNOWN_STATUS_LABEL: Record<string, string> = {
  pending: "pending",
  inProgress: "in progress",
  completed: "completed",
};

export function AgentPlanItem({ steps }: AgentPlanItemProps) {
  if (steps.length === 0) return null;
  return (
    <ol className="desktop-agent-plan-list">
      {steps.map((step, index) => (
        <li key={`${step.step}:${index}`} className={`desktop-agent-plan-step is-${step.status}`}>
          <span>{step.step}</span>
          <small>{KNOWN_STATUS_LABEL[step.status] ?? step.status}</small>
        </li>
      ))}
    </ol>
  );
}
