import { useLocalization } from "@puppyone/localization/react";
import { AgentBrandMark } from "./AgentBrandMark";

type AgentEmptyStateProps = {
  runtimeIconKey?: string | null;
  runtimeLabel: string;
};

/** Quiet ready-state cue; runtime identity belongs here, model configuration does not. */
export function AgentEmptyState({ runtimeIconKey, runtimeLabel }: AgentEmptyStateProps) {
  const { t } = useLocalization();

  return (
    <div className="desktop-agent-empty-state">
      <AgentBrandMark iconKey={runtimeIconKey} label={runtimeLabel} />
      <p>{t("agent.empty.prompt")}</p>
    </div>
  );
}
