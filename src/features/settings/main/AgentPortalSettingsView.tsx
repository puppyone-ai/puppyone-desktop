import { useCallback, useEffect, useState } from "react";
import { useLocalization } from "@puppyone/localization";
import type {
  AgentActivityEnrollmentSnapshot,
  AgentActivityProviderStatus,
} from "../../../../shared/agent-activity-contract/types";
import { SettingsSectionHeader } from "../components";

export function AgentPortalSettingsView() {
  const { t } = useLocalization();
  const [snapshot, setSnapshot] = useState<AgentActivityEnrollmentSnapshot | null>(null);
  const [pendingProviderId, setPendingProviderId] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    setError(false);
    try {
      const next = await window.puppyoneDesktop?.getAgentActivityEnrollment?.();
      if (next) setSnapshot(next);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const changeEnrollment = async (provider: AgentActivityProviderStatus, enabled: boolean) => {
    if (!provider.configurable || pendingProviderId) return;
    setPendingProviderId(provider.providerId);
    setError(false);
    try {
      await window.puppyoneDesktop?.setAgentActivityEnrollment?.({
        providerId: provider.providerId,
        enabled,
      });
      await refresh();
    } catch {
      setError(true);
    } finally {
      setPendingProviderId(null);
    }
  };

  return (
    <section className="desktop-utility-view desktop-settings-view">
      <div className="desktop-utility-body desktop-settings-body" data-po-scrollbar="content">
        <div className="desktop-settings-section">
          <SettingsSectionHeader title={t("settings.agentPortal.title")} />
          <div className="desktop-settings-list">
            {(snapshot?.providers ?? []).map((provider) => {
              const enabled = provider.enrollment === "enabled";
              const status = t(`settings.agentPortal.status.${provider.enrollment}`);
              return (
                <div
                  className="desktop-settings-row desktop-settings-row-control"
                  aria-busy={pendingProviderId === provider.providerId}
                  key={provider.providerId}
                >
                  <span>{provider.displayName}</span>
                  <label className="desktop-settings-switch" title={status}>
                    <input
                      type="checkbox"
                      aria-label={t("settings.agentPortal.toggle", { provider: provider.displayName })}
                      aria-description={status}
                      checked={enabled}
                      disabled={!provider.configurable || pendingProviderId !== null}
                      onChange={(event) => void changeEnrollment(provider, event.target.checked)}
                    />
                    <span aria-hidden="true" />
                  </label>
                </div>
              );
            })}
            {!snapshot && !error && (
              <div className="desktop-settings-row" role="status">
                <span>{t("settings.agentPortal.loading")}</span>
              </div>
            )}
            {error && (
              <div className="desktop-settings-row desktop-settings-row-control" role="alert">
                <span>{t("settings.agentPortal.error")}</span>
                <button className="desktop-settings-row-action" type="button" onClick={() => void refresh()}>
                  {t("settings.agentPortal.retry")}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
