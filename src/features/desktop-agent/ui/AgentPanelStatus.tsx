import { CircleAlert, RefreshCw } from "lucide-react";
import { bidiIsolate } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import type { AgentRuntimeReadiness } from "../domain/agent-contract";
import type { AgentErrorDescriptor } from "../application/agent-error";
import { presentAgentError } from "./agentErrorPresentation";
import { presentRuntimeReadiness } from "./agentPanelPresentation";

type AgentPanelStatusProps = {
  unavailable: boolean;
  failed: boolean;
  error: AgentErrorDescriptor | null;
  runtimeLabel: string;
  readiness?: AgentRuntimeReadiness;
  onRetry: () => void;
};

export function AgentPanelStatus({
  unavailable,
  failed,
  error,
  runtimeLabel,
  readiness,
  onRetry,
}: AgentPanelStatusProps) {
  const { t } = useLocalization();
  const errorPresentation = presentAgentError(error, t);
  const readinessPresentation = presentRuntimeReadiness(readiness, runtimeLabel, t);
  const detail = failed ? errorPresentation?.detail : readinessPresentation.detail;
  return (
    <>
      {(unavailable || failed) && (
        <div className="desktop-agent-readiness" role="status">
          <CircleAlert size={15} />
          <div>
            <strong>{failed
              ? t("agent.readiness.sessionAttention", { agent: bidiIsolate(runtimeLabel) })
              : readinessPresentation.heading}</strong>
            <p>{failed
              ? errorPresentation?.summary || t("agent.readiness.sessionRecovery")
              : detail}</p>
            {!failed && <small className="desktop-agent-readiness-code">{t("agent.readiness.statusCode", { code: readinessPresentation.code })}</small>}
            {!failed && readinessPresentation.diagnostic && (
              <small dir="auto">{t("agent.readiness.diagnostic", { detail: bidiIsolate(readinessPresentation.diagnostic) })}</small>
            )}
            {failed && detail && <small dir="auto">{detail}</small>}
          </div>
          <button type="button" aria-label={t("agent.readiness.retryAria")} onClick={onRetry}><RefreshCw size={14} /> {t("common.action.retry")}</button>
        </div>
      )}
      {errorPresentation && !unavailable && !failed && (
        <div className="desktop-agent-inline-error" role="alert">
          <CircleAlert size={14} />
          <span>{errorPresentation.summary}</span>
          {errorPresentation.detail && <small dir="auto">{errorPresentation.detail}</small>}
        </div>
      )}
    </>
  );
}
