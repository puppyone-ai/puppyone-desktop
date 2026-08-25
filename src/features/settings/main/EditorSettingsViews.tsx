import { useLocalization } from "@puppyone/localization";
import type { DiffMarkers, ExperimentalSettings } from "../../../preferences";
import { SettingsSectionHeader } from "../components";

export function EditorSettingsView({
  aiEditAssistEnabled,
  diffMarkers,
  onAiEditAssistEnabledChange,
  onDiffMarkersChange,
}: {
  aiEditAssistEnabled: boolean;
  diffMarkers: DiffMarkers;
  onAiEditAssistEnabledChange: (enabled: boolean) => void;
  onDiffMarkersChange: (markers: DiffMarkers) => void;
}) {
  const { t } = useLocalization();
  return (
    <section className="desktop-utility-view desktop-settings-view">
      <div className="desktop-utility-body desktop-settings-body" data-po-scrollbar="content">
        <div className="desktop-settings-section">
          <SettingsSectionHeader title={t("settings.editor.title")} detail={t("settings.editor.detail")} />
          <div className="desktop-settings-list">
            <div className="desktop-settings-row desktop-settings-row-control">
              <span title={t("settings.editor.aiAssist.detail")}>
                {t("settings.editor.aiAssist.title")}
              </span>
              <SettingsToggle
                label={t("settings.editor.aiAssist.title")}
                description={t("settings.editor.aiAssist.detail")}
                checked={aiEditAssistEnabled}
                onChange={onAiEditAssistEnabledChange}
              />
            </div>
            <div className="desktop-settings-row desktop-settings-row-control">
              <span title={t("settings.editor.diffMarkers.detail")}>
                {t("settings.editor.diffMarkers.title")}
              </span>
              <div
                className="desktop-theme-segment"
                aria-label={t("settings.editor.diffMarkers.ariaLabel")}
                aria-description={t("settings.editor.diffMarkers.detail")}
                title={t("settings.editor.diffMarkers.detail")}
              >
                <button
                  type="button"
                  className={diffMarkers === "color" ? "active" : ""}
                  aria-pressed={diffMarkers === "color"}
                  onClick={() => onDiffMarkersChange("color")}
                >
                  <span>{t("settings.editor.diffMarkers.color")}</span>
                </button>
                <button
                  type="button"
                  className={diffMarkers === "symbols" ? "active" : ""}
                  aria-pressed={diffMarkers === "symbols"}
                  onClick={() => onDiffMarkersChange("symbols")}
                >
                  <span>+ / −</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ExperimentalSettingsView({
  settings,
  agentChatAvailable,
  assetLibraryHomeAvailable,
  onChange,
}: {
  settings: ExperimentalSettings;
  agentChatAvailable: boolean;
  assetLibraryHomeAvailable: boolean;
  onChange: (settings: ExperimentalSettings) => void;
}) {
  const { t } = useLocalization();
  const rows: Array<{
    messageKey: string;
    settingKey: keyof ExperimentalSettings;
  }> = [
    { messageKey: "viewerPlugins", settingKey: "enableViewerPlugins" },
    { messageKey: "editorSaveStatus", settingKey: "enableEditorSaveStatus" },
    { messageKey: "markdownBlockDrag", settingKey: "enableMarkdownBlockDrag" },
    ...(assetLibraryHomeAvailable
      ? [{ messageKey: "projectsHome", settingKey: "enableAssetLibraryHome" as const }]
      : []),
    ...(agentChatAvailable
      ? [{ messageKey: "agentChat", settingKey: "enableAgentChat" as const }]
      : []),
    { messageKey: "cloudWorkspace", settingKey: "enableCloudWorkspace" },
    { messageKey: "flowFiles", settingKey: "enablePuppyFlowFiles" },
  ];

  return (
    <section className="desktop-utility-view desktop-settings-view">
      <div className="desktop-utility-body desktop-settings-body" data-po-scrollbar="content">
        <div className="desktop-settings-section">
          <SettingsSectionHeader
            title={t("settings.experimental.title")}
            detail={t("settings.experimental.detail")}
          />
          <div className="desktop-settings-list">
            {rows.map(({ messageKey, settingKey }) => (
              <div className="desktop-settings-row desktop-settings-row-control" key={settingKey}>
                <span title={t(`settings.experimental.${messageKey}.detail`)}>
                  {t(`settings.experimental.${messageKey}.title`)}
                </span>
                <SettingsToggle
                  label={t(`settings.experimental.${messageKey}.title`)}
                  description={t(`settings.experimental.${messageKey}.detail`)}
                  checked={settings[settingKey]}
                  onChange={(checked) => onChange({ ...settings, [settingKey]: checked })}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function SettingsToggle({
  checked,
  description,
  label,
  onChange,
}: {
  checked: boolean;
  description: string;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="desktop-settings-switch" title={description}>
      <input
        type="checkbox"
        aria-label={label}
        aria-description={description}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span aria-hidden="true" />
    </label>
  );
}
