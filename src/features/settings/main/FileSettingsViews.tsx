import { useEffect, useState } from "react";
import { Check, ExternalLink, RefreshCw } from "lucide-react";
import { useLocalization } from "@puppyone/localization";
import { chooseWorkspaceExternalApp } from "../../../lib/localFiles";
import {
  DEFAULT_EXPLORER_EXCLUDE_PATTERNS,
  normalizeExplorerExcludePatterns,
  normalizeExternalAppExtension,
  removeExternalAppOverride,
  upsertExternalAppOverride,
  type ExternalAppsSettings,
  type FilesVisibilitySettings,
} from "../../../preferences";
import { ExternalAppIcon } from "../../external-apps/ExternalAppIcon";
import { SettingsSectionHeader, SettingsSubsection, SettingsValueRow } from "../components";

export function FilesSettingsView({
  settings,
  onChange,
}: {
  settings: FilesVisibilitySettings;
  onChange: (settings: FilesVisibilitySettings) => void;
}) {
  const { t } = useLocalization();
  const savedPatternText = settings.excludePatterns.join("\n");
  const [patternDraft, setPatternDraft] = useState(savedPatternText);
  const normalizedDraft = normalizeExplorerExcludePatterns(patternDraft);
  const patternsDirty = normalizedDraft.join("\n") !== savedPatternText;

  useEffect(() => setPatternDraft(savedPatternText), [savedPatternText]);

  const applyPatterns = () => onChange({ ...settings, excludePatterns: normalizedDraft });
  const resetPatterns = () => {
    const nextPatterns = [...DEFAULT_EXPLORER_EXCLUDE_PATTERNS];
    setPatternDraft(nextPatterns.join("\n"));
    onChange({ ...settings, excludePatterns: nextPatterns });
  };

  return (
    <section className="desktop-utility-view desktop-settings-view">
      <div className="desktop-utility-body desktop-settings-body">
        <div className="desktop-settings-section desktop-files-settings-section">
          <SettingsSectionHeader title={t("settings.files.title")} detail={t("settings.files.detail")} />
          <SettingsSubsection>
            <div className="desktop-settings-row desktop-settings-row-control desktop-settings-toggle-row desktop-files-toggle-row">
              <span>{t("settings.files.showHidden")}</span>
              <label className="desktop-settings-switch">
                <input
                  type="checkbox"
                  aria-label={t("settings.files.showHidden")}
                  checked={settings.showHiddenFiles}
                  onChange={(event) => onChange({ ...settings, showHiddenFiles: event.target.checked })}
                />
                <span aria-hidden="true" />
              </label>
            </div>
            <div className="desktop-settings-row desktop-settings-pattern-editor desktop-files-pattern-editor">
              <span className="desktop-settings-label-stack">
                <strong>{t("settings.files.excludePatterns")}</strong>
                <small>{t("settings.files.patternCount", { count: normalizedDraft.length })}</small>
              </span>
              <div className="desktop-settings-pattern-control">
                <textarea
                  aria-label={t("settings.files.excludePatterns")}
                  value={patternDraft}
                  spellCheck={false}
                  onChange={(event) => setPatternDraft(event.target.value)}
                />
                <div className="desktop-settings-pattern-editor-footer">
                  <button className="desktop-settings-row-action" type="button" disabled={!patternsDirty} onClick={applyPatterns}>
                    <Check size={13} /><span>{t("common.action.apply")}</span>
                  </button>
                  <button className="desktop-settings-row-action" type="button" onClick={resetPatterns}>
                    <RefreshCw size={13} /><span>{t("common.action.reset")}</span>
                  </button>
                </div>
              </div>
            </div>
          </SettingsSubsection>
        </div>
      </div>
    </section>
  );
}

export function DefaultAppsSettingsView({
  settings,
  onChange,
}: {
  settings: ExternalAppsSettings;
  onChange: (settings: ExternalAppsSettings) => void;
}) {
  const { t } = useLocalization();
  const [extensionDraft, setExtensionDraft] = useState("");
  const [choosingExtension, setChoosingExtension] = useState<string | null>(null);
  const [choiceError, setChoiceError] = useState<string | null>(null);
  const normalizedDraftExtension = normalizeExternalAppExtension(extensionDraft);

  const chooseDefaultAppForExtension = async (extensionValue: string) => {
    const extension = normalizeExternalAppExtension(extensionValue);
    if (!extension) {
      setChoiceError(t("settings.defaultApps.invalidExtension"));
      return;
    }
    setChoiceError(null);
    setChoosingExtension(extension);
    try {
      const target = await chooseWorkspaceExternalApp({ extension });
      if (!target?.appPath) return;
      onChange(upsertExternalAppOverride(settings, {
        extension,
        appPath: target.appPath,
        appName: target.appName,
        bundleId: target.bundleId,
        iconDataUrl: target.iconDataUrl,
      }));
      setExtensionDraft("");
    } catch (error) {
      setChoiceError(error instanceof Error ? error.message : String(error));
    } finally {
      setChoosingExtension(null);
    }
  };

  return (
    <section className="desktop-utility-view desktop-settings-view">
      <div className="desktop-utility-body desktop-settings-body">
        <div className="desktop-settings-section">
          <SettingsSectionHeader title={t("settings.defaultApps.title")} detail={t("settings.defaultApps.detail")} />
          <SettingsSubsection title={t("settings.defaultApps.systemDefault")}>
            <SettingsValueRow
              label={t("settings.defaultApps.openMode")}
              value={t("settings.defaultApps.macosDefault")}
              action={<span className="desktop-settings-badge connected">{t("settings.defaultApps.system")}</span>}
            />
            <div className="desktop-settings-row desktop-settings-row-control">
              <span className="desktop-settings-label-stack">
                <strong>{t("settings.defaultApps.executableProtection.title")}</strong>
                <small>{t("settings.defaultApps.executableProtection.detail")}</small>
              </span>
              <span className="desktop-settings-badge connected">{t("settings.defaultApps.alwaysOn")}</span>
            </div>
          </SettingsSubsection>
          <SettingsSubsection title={t("settings.defaultApps.fileTypeDefaults")}>
            <div className="desktop-settings-row desktop-settings-row-control desktop-settings-default-app-add">
              <span className="desktop-settings-label-stack">
                <strong>{t("settings.defaultApps.addFileType.title")}</strong>
                <small>{t("settings.defaultApps.addFileType.detail")}</small>
              </span>
              <div className="desktop-settings-value">
                <input
                  className="desktop-settings-text-input desktop-settings-extension-input"
                  type="text"
                  aria-label={t("settings.defaultApps.addFileType.title")}
                  spellCheck={false}
                  placeholder="md"
                  value={extensionDraft}
                  onChange={(event) => { setExtensionDraft(event.target.value); setChoiceError(null); }}
                  onKeyDown={(event) => { if (event.key === "Enter") void chooseDefaultAppForExtension(extensionDraft); }}
                />
                <button
                  className="desktop-settings-row-action"
                  type="button"
                  disabled={!normalizedDraftExtension || choosingExtension !== null}
                  onClick={() => void chooseDefaultAppForExtension(extensionDraft)}
                >
                  <ExternalLink size={13} />
                  <span>{t(choosingExtension === normalizedDraftExtension ? "settings.defaultApps.choosing" : "common.action.chooseApp")}</span>
                </button>
              </div>
            </div>
            {settings.overrides.length === 0 ? (
              <div className="desktop-settings-muted-row">{t("settings.defaultApps.empty")}</div>
            ) : (
              <div className="desktop-settings-external-app-list">
                {settings.overrides.map((override) => (
                  <div className="desktop-settings-external-app-row" key={override.extension}>
                    <ExternalAppIcon
                      appName={override.appName}
                      className="desktop-settings-external-app-icon"
                      iconDataUrl={override.iconDataUrl}
                      loadingClassName="desktop-settings-external-app-loader"
                    />
                    <span className="desktop-settings-label-stack">
                      <strong>.{override.extension}</strong>
                      <small dir="auto">{getExternalAppOverrideLabel(override.appPath, override.appName, t("settings.defaultApps.customApp"))}</small>
                    </span>
                    <span className="desktop-settings-row-action-group">
                      <button
                        className="desktop-settings-row-action"
                        type="button"
                        disabled={choosingExtension !== null}
                        onClick={() => void chooseDefaultAppForExtension(override.extension)}
                      >
                        {t("common.action.change")}
                      </button>
                      <button
                        className="desktop-settings-row-action"
                        type="button"
                        onClick={() => onChange(removeExternalAppOverride(settings, override.extension))}
                      >
                        {t("common.action.reset")}
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}
            {choiceError && <div className="desktop-settings-account-feedback danger">{choiceError}</div>}
          </SettingsSubsection>
        </div>
      </div>
    </section>
  );
}

function getExternalAppOverrideLabel(
  appPath: string,
  appName: string | null | undefined,
  fallback: string,
): string {
  if (appName?.trim()) return appName.trim();
  const leafName = appPath.replace(/\\/g, "/").split("/").pop();
  return leafName?.replace(/\.app$/i, "") || fallback;
}
