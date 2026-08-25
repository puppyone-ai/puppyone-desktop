import { RefreshCw } from "lucide-react";
import { useMemo } from "react";
import { useLocalization } from "@puppyone/localization";
import type { LocalAgentsSettings } from "../../../preferences";
import { useTerminalAgentLocator } from "../../desktop-terminal/controller/useTerminalAgentLocator";
import { DESKTOP_TERMINAL_LAUNCHERS } from "../../desktop-terminal/model/terminalLaunchers";
import { TerminalLauncherIcon } from "../../desktop-terminal/ui/TerminalLauncherIcon";
import { SettingsSectionHeader } from "../../settings/components";
import {
  isTerminalAgentVisible,
  setTerminalAgentVisible,
} from "../model/localAgentSelection";
import { LocalAgentHooksSettingsSection } from "./LocalAgentHooksSettingsView";

export function LocalAgentsSettingsView({
  settings,
  onChange,
  onActivityIndicatorsEnabledChange,
}: {
  settings: LocalAgentsSettings;
  onChange: (settings: LocalAgentsSettings) => void;
  onActivityIndicatorsEnabledChange: (enabled: boolean) => void;
}) {
  const { t } = useLocalization();
  const {
    ids: detectedAgentIds,
    phase,
    refresh,
  } = useTerminalAgentLocator({ enabled: true });
  const detected = useMemo(() => {
    const ids = new Set(detectedAgentIds);
    return DESKTOP_TERMINAL_LAUNCHERS.filter(
      (launcher) => launcher.id !== "shell" && ids.has(launcher.id),
    );
  }, [detectedAgentIds]);
  const scanning = phase === "idle" || phase === "loading";

  return (
    <section className="desktop-utility-view desktop-settings-view">
      <div className="desktop-utility-body desktop-settings-body" data-po-scrollbar="content">
        <div className="desktop-settings-section">
          <div className="desktop-settings-heading-row">
            <SettingsSectionHeader
              title={t("settings.localAgents.title")}
              detail={t("settings.localAgents.detail")}
            />
            <button
              className="desktop-settings-action"
              type="button"
              aria-label={t("settings.localAgents.scan")}
              title={t("settings.localAgents.scan")}
              disabled={scanning}
              onClick={() => void refresh()}
            >
              <RefreshCw size={14} className={scanning ? "spin" : undefined} aria-hidden="true" />
              <span>{t("settings.localAgents.scan")}</span>
            </button>
          </div>
          <div className="desktop-settings-list">
            {detected.map((launcher) => {
              const visible = isTerminalAgentVisible(settings, launcher.id);
              const displayName = t(launcher.nameMessage);
              return (
                <div
                  className="desktop-settings-row desktop-settings-row-control desktop-local-agent-row"
                  key={launcher.id}
                >
                  <span className="desktop-local-agent-identity">
                    <TerminalLauncherIcon launcherId={launcher.id} />
                    <span className="desktop-local-agent-row-copy">
                      <span className="desktop-local-agent-name">{displayName}</span>
                    </span>
                  </span>
                  <label
                    className="desktop-settings-switch"
                    title={t("settings.localAgents.toggle", { agent: displayName })}
                  >
                    <input
                      type="checkbox"
                      checked={visible}
                      aria-label={t("settings.localAgents.toggle", { agent: displayName })}
                      onChange={(event) => onChange(setTerminalAgentVisible(
                        settings,
                        launcher.id,
                        event.target.checked,
                      ))}
                    />
                    <span aria-hidden="true" />
                  </label>
                </div>
              );
            })}
            {scanning && detected.length === 0 && (
              <div className="desktop-settings-row" role="status">
                <span>{t("settings.localAgents.scanning")}</span>
              </div>
            )}
            {phase === "ready" && detected.length === 0 && (
              <div className="desktop-settings-row">
                <span>{t("settings.localAgents.empty")}</span>
              </div>
            )}
            {phase === "error" && (
              <div className="desktop-settings-row desktop-settings-row-control" role="alert">
                <span>{t("settings.localAgents.error")}</span>
                <button className="desktop-settings-row-action" type="button" onClick={() => void refresh()}>
                  {t("settings.localAgents.retry")}
                </button>
              </div>
            )}
          </div>
        </div>
        <LocalAgentHooksSettingsSection
          detectedAgentIds={detectedAgentIds}
          agentPhase={phase}
          onRefreshAgents={refresh}
          onActivityIndicatorsEnabledChange={onActivityIndicatorsEnabledChange}
        />
      </div>
    </section>
  );
}
