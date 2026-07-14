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
      <div className="desktop-utility-body desktop-settings-body">
        <div className="desktop-settings-section">
          <SettingsSectionHeader title={t("settings.editor.title")} detail={t("settings.editor.detail")} />
          <div className="desktop-settings-list">
            <div className="desktop-settings-row desktop-settings-row-control">
              <span className="desktop-settings-label-stack">
                <strong>{t("settings.editor.aiAssist.title")}</strong>
                <small>{t("settings.editor.aiAssist.detail")}</small>
              </span>
              <SettingsToggle
                label={t("settings.editor.aiAssist.title")}
                checked={aiEditAssistEnabled}
                onChange={onAiEditAssistEnabledChange}
              />
            </div>
            <div className="desktop-settings-row desktop-settings-row-control">
              <span className="desktop-settings-label-stack">
                <strong>{t("settings.editor.diffMarkers.title")}</strong>
                <small>{t("settings.editor.diffMarkers.detail")}</small>
              </span>
              <div className="desktop-theme-segment" aria-label={t("settings.editor.diffMarkers.ariaLabel")}>
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
    { messageKey: "minimalMode", settingKey: "enableMinimalMode" },
    { messageKey: "viewerPlugins", settingKey: "enableViewerPlugins" },
    { messageKey: "markdownBlockDrag", settingKey: "enableMarkdownBlockDrag" },
    ...(assetLibraryHomeAvailable
      ? [{ messageKey: "projectsHome", settingKey: "enableAssetLibraryHome" as const }]
      : []),
    ...(agentChatAvailable
      ? [{ messageKey: "agentChat", settingKey: "enableAgentChat" as const }]
      : []),
    { messageKey: "appFiles", settingKey: "enablePuppyoneAppFiles" },
    { messageKey: "flowFiles", settingKey: "enablePuppyFlowFiles" },
  ];

  return (
    <section className="desktop-utility-view desktop-settings-view">
      <div className="desktop-utility-body desktop-settings-body">
        <div className="desktop-settings-section">
          <SettingsSectionHeader
            title={t("settings.experimental.title")}
            detail={t("settings.experimental.detail")}
          />
          <div className="desktop-settings-list">
            {rows.map(({ messageKey, settingKey }) => (
              <div className="desktop-settings-row desktop-settings-row-control" key={settingKey}>
                <span className="desktop-settings-label-stack">
                  <strong>{t(`settings.experimental.${messageKey}.title`)}</strong>
                  <small>{t(`settings.experimental.${messageKey}.detail`)}</small>
                </span>
                <SettingsToggle
                  label={t(`settings.experimental.${messageKey}.title`)}
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
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="desktop-settings-switch">
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span aria-hidden="true" />
    </label>
  );
}
