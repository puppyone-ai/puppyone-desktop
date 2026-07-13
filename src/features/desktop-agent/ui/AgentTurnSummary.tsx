import type { AgentTurnTerminalState } from "../domain/agent-contract";
import { useLocalization } from "@puppyone/localization/react";
import { formatAgentDuration } from "../domain/agent-activity-presentation";

type AgentTurnSummaryProps = {
  durationMs: number;
  status: AgentTurnTerminalState;
};

/** Quiet end-of-turn metadata. It is derived from normalized lifecycle events, never model text. */
export function AgentTurnSummary({ durationMs, status }: AgentTurnSummaryProps) {
  const { t, formatNumber } = useLocalization();
  const duration = formatAgentDuration(durationMs, t, formatNumber);
  return (
    <div className="desktop-agent-turn-summary" data-status={status} role="status">
      <span className="desktop-agent-turn-summary-line" aria-hidden="true" />
      <span>{t("agent.turn.workedFor", { duration })}</span>
      <span className="desktop-agent-turn-summary-line" aria-hidden="true" />
    </div>
  );
}
