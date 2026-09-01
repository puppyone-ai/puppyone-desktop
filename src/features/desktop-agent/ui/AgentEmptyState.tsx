import { useState, type CSSProperties } from "react";
import { bidiIsolate } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import { AgentBrandMark } from "./AgentBrandMark";

type AgentEmptyStateProps = {
  runtimeIconKey?: string | null;
  runtimeLabel: string;
};

/** Quiet ready-state cue; runtime identity belongs here, model configuration does not. */
export function AgentEmptyState({ runtimeIconKey, runtimeLabel }: AgentEmptyStateProps) {
  const { t } = useLocalization();
  const [logoTurns, setLogoTurns] = useState(0);
  const logoStyle = {
    "--desktop-agent-empty-logo-turns": logoTurns,
  } as CSSProperties;

  return (
    <div className="desktop-agent-empty-state">
      <button
        type="button"
        className="desktop-agent-empty-logo-button"
        style={logoStyle}
        aria-label={t("agent.empty.spinLogo", { agent: bidiIsolate(runtimeLabel) })}
        onClick={() => setLogoTurns((turns) => turns + 1)}
      >
        <AgentBrandMark
          appearance="monochrome"
          iconKey={runtimeIconKey}
          label={runtimeLabel}
        />
      </button>
      <p>{t("agent.empty.prompt")}</p>
    </div>
  );
}
