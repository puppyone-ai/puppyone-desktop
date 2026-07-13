import { CircleAlert, RefreshCw } from "lucide-react";
import { bidiIsolate } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import type { AgentProviderReadiness } from "../domain/agent-contract";
import type { AgentErrorDescriptor } from "../application/agent-error";
import { presentAgentError } from "./agentErrorPresentation";

type AgentPanelStatusProps = {
  unavailable: boolean;
  failed: boolean;
  error: AgentErrorDescriptor | null;
  runtimeLabel: string;
  readiness?: AgentProviderReadiness;
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
  const detail = readiness?.message || errorPresentation?.detail;
  return (
    <>
      {(unavailable || failed) && (
        <div className="desktop-agent-readiness" role="status">
          <CircleAlert size={15} />
          <div>
            <strong>{failed
              ? t("agent.readiness.sessionAttention", { agent: bidiIsolate(runtimeLabel) })
              : readinessHeading(readiness?.status, runtimeLabel, t)}</strong>
            <p>{failed
              ? errorPresentation?.summary || t("agent.readiness.sessionRecovery")
              : readinessMessage(readiness?.status, runtimeLabel, t)}</p>
            {detail && <small dir="auto">{detail}</small>}
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

function readinessHeading(status: string | undefined, runtimeLabel: string, t: ReturnType<typeof useLocalization>["t"]) {
  if (status === "installed-not-authenticated") return t("agent.readiness.connect", { agent: bidiIsolate(runtimeLabel) });
  return t("agent.readiness.needsAttention", { agent: bidiIsolate(runtimeLabel) });
}

function readinessMessage(status: string | undefined, runtimeLabel: string, t: ReturnType<typeof useLocalization>["t"]) {
  if (status === "installed-not-authenticated") return t("agent.readiness.setupRequired");
  if (status === "not-installed") return t("agent.readiness.notInstalled");
  if (status === "unsupported-version") return t("agent.readiness.updateRequired");
  if (status === "protocol-unavailable") return t("agent.readiness.integrationUnavailable");
  return t("agent.readiness.inspectFailed", { agent: bidiIsolate(runtimeLabel) });
}
