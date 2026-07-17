import { useState } from "react";
import { ShieldCheck, Unlink } from "lucide-react";
import { bidiIsolate, useLocalization } from "@puppyone/localization";
import { DesktopUpdateSettingsRow, type useDesktopUpdates } from "../../../components/DesktopUpdateControls";
import type { Workspace } from "@puppyone/shared-ui";
import { SettingsSectionHeader } from "../components";

export function GeneralSettingsView({
  workspace,
  updateState,
  onCheckForUpdates,
  onUpdateNow,
  onUnlinkWorkspace,
}: {
  workspace: Workspace;
  updateState: ReturnType<typeof useDesktopUpdates>["state"];
  onCheckForUpdates: () => void;
  onUpdateNow: () => void;
  onUnlinkWorkspace: () => Promise<void>;
}) {
  const { t } = useLocalization();
  const [unlinking, setUnlinking] = useState(false);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);

  const unlinkWorkspace = async () => {
    if (unlinking) return;
    const confirmed = window.confirm(
      t("settings.general.unlink.confirm", { workspace: bidiIsolate(workspace.name) }),
    );
    if (!confirmed) return;
    setUnlinking(true);
    setUnlinkError(null);
    try {
      await onUnlinkWorkspace();
    } catch (error) {
      setUnlinkError(error instanceof Error ? error.message : String(error));
      setUnlinking(false);
    }
  };

  return (
    <section className="desktop-utility-view desktop-settings-view">
      <div className="desktop-utility-body desktop-settings-body">
        <div className="desktop-settings-section">
          <SettingsSectionHeader title={t("settings.general.title")} detail={t("settings.general.detail")} />
          <div className="desktop-settings-list">
            <div className="desktop-settings-row"><span>{t("settings.general.name")}</span><strong dir="auto" title={workspace.name}>{workspace.name}</strong></div>
            <div className="desktop-settings-row"><span>{t("settings.general.path")}</span><strong dir="ltr" title={workspace.path}>{workspace.path}</strong></div>
            <div className="desktop-settings-row"><span>{t("settings.general.mode")}</span><strong>{t("settings.general.modeLocal")}</strong></div>
            <div className="desktop-settings-row">
              <span>{t("settings.general.status")}</span>
              <strong className="desktop-settings-status"><ShieldCheck size={14} />{t("settings.general.protected")}</strong>
            </div>
            <DesktopUpdateSettingsRow
              state={updateState}
              onCheckForUpdates={onCheckForUpdates}
              onUpdateNow={onUpdateNow}
            />
            <div className="desktop-settings-row desktop-settings-row-control">
              <span>{t("settings.general.recentWorkspace")}</span>
              <button
                className="desktop-settings-action danger"
                type="button"
                disabled={unlinking}
                title={t("settings.general.unlink.title")}
                onClick={() => void unlinkWorkspace()}
              >
                <Unlink size={14} />
                <span>{t(unlinking ? "settings.general.unlink.progress" : "settings.general.unlink.action")}</span>
              </button>
            </div>
            {unlinkError && <div className="desktop-utility-empty danger">{unlinkError}</div>}
          </div>
        </div>
      </div>
    </section>
  );
}
