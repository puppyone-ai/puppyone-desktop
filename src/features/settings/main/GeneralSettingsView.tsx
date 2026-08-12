import { useLocalization } from "@puppyone/localization";
import { DesktopUpdateSettingsRow, type DesktopUpdatesController } from "../../updates";
import { DesktopBuildVersionSettingsRow } from "../../build-info/DesktopBuildIdentity";
import { LanguageSettingRow } from "../LanguageSetting";
import { SettingsSectionHeader } from "../components";

export function GeneralSettingsView({
  updateState,
  onCheckForUpdates,
  onUpdateNow,
}: {
  updateState: DesktopUpdatesController["state"];
  onCheckForUpdates: () => void;
  onUpdateNow: () => void;
}) {
  const { t } = useLocalization();

  return (
    <section className="desktop-utility-view desktop-settings-view">
      <div className="desktop-utility-body desktop-settings-body" data-po-scrollbar="content">
        <div className="desktop-settings-section">
          <SettingsSectionHeader title={t("settings.general.title")} detail={t("settings.general.detail")} />
          <div className="desktop-settings-list">
            <LanguageSettingRow />
            <DesktopBuildVersionSettingsRow />
            <DesktopUpdateSettingsRow
              state={updateState}
              onCheckForUpdates={onCheckForUpdates}
              onUpdateNow={onUpdateNow}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
