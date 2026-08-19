import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalization } from "@puppyone/localization";
import type { AgentLocalConnection } from "../../../../shared/agent-contract/types";
import type { LocalAgentsSettings } from "../../../preferences";
import { SettingsSectionHeader } from "../../settings/components";
import { discoverLocalAgents } from "../infrastructure/electron/localAgentInventoryClient";
import {
  installedLocalAgents,
  isLocalAgentEnabled,
  setLocalAgentEnabled,
} from "../model/localAgentSelection";

export function LocalAgentsSettingsView({
  workspaceRoot,
  settings,
  onChange,
}: {
  workspaceRoot: string;
  settings: LocalAgentsSettings;
  onChange: (settings: LocalAgentsSettings) => void;
}) {
  const { t } = useLocalization();
  const [connections, setConnections] = useState<AgentLocalConnection[]>([]);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");

  const scan = useCallback(async (refresh: boolean) => {
    setPhase("loading");
    try {
      const snapshot = await discoverLocalAgents(workspaceRoot, refresh);
      setConnections(snapshot.connections);
      setPhase("ready");
    } catch {
      setPhase("error");
    }
  }, [workspaceRoot]);

  useEffect(() => {
    void scan(false);
  }, [scan]);

  const installed = useMemo(() => installedLocalAgents(connections), [connections]);

  return (
    <section className="desktop-utility-view desktop-settings-view">
      <div className="desktop-utility-body desktop-settings-body" data-po-scrollbar="content">
        <div className="desktop-settings-section">
          <div className="desktop-settings-heading-row">
            <SettingsSectionHeader title={t("settings.localAgents.title")} />
            <button
              className="desktop-settings-action"
              type="button"
              aria-label={t("settings.localAgents.scan")}
              title={t("settings.localAgents.scan")}
              disabled={phase === "loading"}
              onClick={() => void scan(true)}
            >
              <RefreshCw size={14} className={phase === "loading" ? "spin" : undefined} aria-hidden="true" />
              <span>{t("settings.localAgents.scan")}</span>
            </button>
          </div>
          <div className="desktop-settings-list">
            {installed.map((connection) => (
              <div className="desktop-settings-row desktop-settings-row-control" key={connection.id}>
                <span>{connection.displayName}</span>
                <label className="desktop-settings-switch" title={connection.statusMessage}>
                  <input
                    type="checkbox"
                    checked={isLocalAgentEnabled(settings, connection.id)}
                    aria-label={t("settings.localAgents.toggle", { agent: connection.displayName })}
                    aria-description={connection.statusMessage}
                    onChange={(event) => onChange(setLocalAgentEnabled(
                      settings,
                      connection.id,
                      event.target.checked,
                    ))}
                  />
                  <span aria-hidden="true" />
                </label>
              </div>
            ))}
            {phase === "loading" && installed.length === 0 && (
              <div className="desktop-settings-row" role="status">
                <span>{t("settings.localAgents.scanning")}</span>
              </div>
            )}
            {phase === "ready" && installed.length === 0 && (
              <div className="desktop-settings-row">
                <span>{t("settings.localAgents.empty")}</span>
              </div>
            )}
            {phase === "error" && (
              <div className="desktop-settings-row desktop-settings-row-control" role="alert">
                <span>{t("settings.localAgents.error")}</span>
                <button className="desktop-settings-row-action" type="button" onClick={() => void scan(true)}>
                  {t("settings.localAgents.retry")}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
