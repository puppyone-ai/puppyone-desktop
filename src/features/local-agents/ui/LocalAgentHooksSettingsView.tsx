import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalization, type MessageFormatter } from "@puppyone/localization";
import type {
  AgentActivityEnrollmentSnapshot,
  AgentActivityProviderStatus,
} from "../../../../shared/agent-activity-contract/types";
import { useTerminalAgentLocator } from "../../desktop-terminal/controller/useTerminalAgentLocator";
import { SettingsSectionHeader } from "../../settings/components";

type EnrollmentPhase = "loading" | "ready" | "error";

export function LocalAgentHooksSettingsView({
  onActivityIndicatorsEnabledChange,
}: {
  onActivityIndicatorsEnabledChange: (enabled: boolean) => void;
}) {
  const { t } = useLocalization();
  const [providers, setProviders] = useState<readonly AgentActivityProviderStatus[]>([]);
  const [phase, setPhase] = useState<EnrollmentPhase>("loading");
  const [pendingProviderId, setPendingProviderId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const {
    ids: detectedAgentIds,
    phase: agentPhase,
    refresh: refreshAgents,
  } = useTerminalAgentLocator({ enabled: true });
  const detected = useMemo(() => new Set<string>(detectedAgentIds), [detectedAgentIds]);

  const readEnrollment = useCallback(async () => {
    const getEnrollment = window.puppyoneDesktop?.getAgentActivityEnrollment;
    if (!getEnrollment) throw new Error("AGENT_ACTIVITY_ENROLLMENT_UNAVAILABLE");
    const snapshot = await getEnrollment();
    setProviders(snapshot.providers);
    return snapshot;
  }, []);

  const load = useCallback(async () => {
    setPhase("loading");
    setMutationError(null);
    try {
      await readEnrollment();
      setPhase("ready");
    } catch {
      setPhase("error");
    }
  }, [readEnrollment]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    setPhase("loading");
    setMutationError(null);
    try {
      await Promise.all([refreshAgents(), readEnrollment()]);
      setPhase("ready");
    } catch {
      setPhase("error");
    }
  }, [readEnrollment, refreshAgents]);

  const setEnabled = useCallback(async (providerId: string, enabled: boolean) => {
    const setEnrollment = window.puppyoneDesktop?.setAgentActivityEnrollment;
    if (!setEnrollment || pendingProviderId) return;
    setPendingProviderId(providerId);
    setMutationError(null);
    try {
      await setEnrollment({ providerId, enabled });
      const snapshot = await readEnrollment();
      onActivityIndicatorsEnabledChange(hasEnabledHook(snapshot));
    } catch {
      setMutationError(providerId);
    } finally {
      setPendingProviderId(null);
    }
  }, [onActivityIndicatorsEnabledChange, pendingProviderId, readEnrollment]);

  const loading = phase === "loading" || agentPhase === "idle" || agentPhase === "loading";

  return (
    <section className="desktop-utility-view desktop-settings-view">
      <div className="desktop-utility-body desktop-settings-body" data-po-scrollbar="content">
        <div className="desktop-settings-section">
          <div className="desktop-settings-heading-row">
            <SettingsSectionHeader
              title={t("settings.localAgentHooks.title")}
              detail={t("settings.localAgentHooks.detail")}
            />
            <button
              className="desktop-settings-action"
              type="button"
              aria-label={t("settings.localAgentHooks.refresh")}
              title={t("settings.localAgentHooks.refresh")}
              disabled={loading || pendingProviderId !== null}
              onClick={() => void refresh()}
            >
              <RefreshCw size={14} className={loading ? "spin" : undefined} aria-hidden="true" />
              <span>{t("settings.localAgentHooks.refresh")}</span>
            </button>
          </div>
          <div className="desktop-settings-list">
            {providers.map((provider) => {
              const agentDetected = detected.has(provider.providerId);
              const installed = provider.enrollment === "enabled";
              const canToggle = provider.configurable
                && (agentDetected || provider.enrollment === "enabled" || provider.enrollment === "needs-repair");
              const providerPending = pendingProviderId === provider.providerId;
              const providerError = mutationError === provider.providerId;
              const status = providerError
                ? t("settings.localAgentHooks.status.error")
                : hookStatus(provider, agentDetected, t);
              return (
                <div className="desktop-settings-row desktop-settings-row-control" key={provider.providerId}>
                  <span className="desktop-local-agent-row-copy">
                    <strong>{provider.displayName}</strong>
                    <small>{status}</small>
                  </span>
                  {provider.configurable ? (
                    <label className="desktop-settings-switch" title={status}>
                      <input
                        type="checkbox"
                        checked={installed}
                        disabled={!canToggle || providerPending}
                        aria-label={t("settings.localAgentHooks.toggle", { agent: provider.displayName })}
                        aria-description={status}
                        onChange={(event) => void setEnabled(provider.providerId, event.target.checked)}
                      />
                      <span aria-hidden="true" />
                    </label>
                  ) : (
                    <span className="desktop-settings-badge">
                      {t("settings.localAgentHooks.manual")}
                    </span>
                  )}
                </div>
              );
            })}
            {loading && providers.length === 0 && (
              <div className="desktop-settings-row" role="status">
                <span>{t("settings.localAgentHooks.loading")}</span>
              </div>
            )}
            {phase === "error" && (
              <div className="desktop-settings-row desktop-settings-row-control" role="alert">
                <span>{t("settings.localAgentHooks.error")}</span>
                <button className="desktop-settings-row-action" type="button" onClick={() => void refresh()}>
                  {t("settings.localAgentHooks.retry")}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function hasEnabledHook(snapshot: AgentActivityEnrollmentSnapshot) {
  return snapshot.providers.some((provider) => provider.enrollment === "enabled");
}

function hookStatus(
  provider: AgentActivityProviderStatus,
  agentDetected: boolean,
  t: MessageFormatter,
) {
  if (provider.enrollment === "enabled") return t("settings.localAgentHooks.status.installed");
  if (provider.enrollment === "needs-repair") return t("settings.localAgentHooks.status.needsRepair");
  if (!agentDetected) return t("settings.localAgentHooks.status.agentMissing");
  if (provider.enrollment === "basic-only") return t("settings.localAgentHooks.status.manual");
  return t("settings.localAgentHooks.status.notInstalled");
}
