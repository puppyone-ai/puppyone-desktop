import { useState } from "react";
import { ShieldCheck, Unlink } from "lucide-react";
import { bidiIsolate, useLocalization } from "@puppyone/localization";
import type { Workspace } from "@puppyone/shared-ui";
import { SettingsSectionHeader } from "../components";

export function LocalProjectSettingsView({
  workspace,
  onUnlinkWorkspace,
}: {
  workspace: Workspace;
  onUnlinkWorkspace: () => Promise<void>;
}) {
  const { t } = useLocalization();
  const [unlinking, setUnlinking] = useState(false);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);

  const unlinkWorkspace = async () => {
    if (unlinking) return;
    const confirmed = window.confirm(
      t("settings.localProject.unlink.confirm", { workspace: bidiIsolate(workspace.name) }),
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
      <div className="desktop-utility-body desktop-settings-body" data-po-scrollbar="content">
        <div className="desktop-settings-section">
          <SettingsSectionHeader
            title={t("settings.localProject.title")}
            detail={t("settings.localProject.detail")}
          />
          <div className="desktop-settings-list">
            <div className="desktop-settings-row">
              <span>{t("settings.localProject.name")}</span>
              <strong dir="auto" title={workspace.name}>{workspace.name}</strong>
            </div>
            <div className="desktop-settings-row">
              <span>{t("settings.localProject.path")}</span>
              <strong dir="ltr" title={workspace.path}>{workspace.path}</strong>
            </div>
            <div className="desktop-settings-row">
              <span>{t("settings.localProject.mode")}</span>
              <strong>{t("settings.localProject.modeLocal")}</strong>
            </div>
            <div className="desktop-settings-row">
              <span>{t("settings.localProject.status")}</span>
              <strong className="desktop-settings-status">
                <ShieldCheck size={14} />
                {t("settings.localProject.protected")}
              </strong>
            </div>
            <div className="desktop-settings-row desktop-settings-row-control">
              <span>{t("settings.localProject.recentWorkspace")}</span>
              <button
                className="desktop-settings-action danger"
                type="button"
                disabled={unlinking}
                title={t("settings.localProject.unlink.title")}
                onClick={() => void unlinkWorkspace()}
              >
                <Unlink size={14} />
                <span>
                  {t(unlinking
                    ? "settings.localProject.unlink.progress"
                    : "settings.localProject.unlink.action")}
                </span>
              </button>
            </div>
            {unlinkError && <div className="desktop-utility-empty danger">{unlinkError}</div>}
          </div>
        </div>
      </div>
    </section>
  );
}
