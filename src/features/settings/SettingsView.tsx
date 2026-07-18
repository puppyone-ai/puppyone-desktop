import { useState } from "react";
import { PanelBottom, PanelLeft, PanelTop } from "lucide-react";
import {
  FILE_ICON_THEMES,
  PULSE_GRID_PRESET_FRAMES,
  PULSE_GRID_PRESET_IDS,
  FileGlyphIcon,
} from "@puppyone/shared-ui";
import { useLocalization } from "@puppyone/localization";
import { DOCK_ICON_OPTIONS, SIDEBAR_NAVIGATION_LAYOUT_OPTIONS, TEXT_SIZE_PRESETS } from "../../preferences";
import { getOrderedHeaderElementDefinitions } from "../app-shell/headerElements";
import { useFeatureFlag } from "../flags";
import { SettingsSectionHeader } from "./components";
import { ContentFontSetting } from "./ContentFontSetting";
import { LanguageSettingsView } from "./LanguageSetting";
import { AccountSettingsView } from "./main/AccountSettingsView";
import { EditorSettingsView, ExperimentalSettingsView } from "./main/EditorSettingsViews";
import { DefaultAppsSettingsView, FilesSettingsView } from "./main/FileSettingsViews";
import { GeneralSettingsView } from "./main/GeneralSettingsView";
import { InterfacePaletteSettings } from "./main/InterfacePaletteSettings";
import { InterfaceStyleSetting } from "./main/InterfaceStyleSetting";
import { PulseGrid } from "../../components/loading";
import { CloudHostingSettingsView, GitSettingsView } from "./main/RepositorySettingsViews";
import type { SettingsViewProps } from "./types";
import { writeClipboardText } from "./utils";
export function SettingsView({
  workspace,
  activeSection,
  gitStatus,
  gitStatusLoading,
  gitStatusError,
  themeMode,
  interfaceStyle,
  lightThemePreset,
  darkThemePreset,
  loadingAnimationPreset,
  textSize,
  typographyPreferences,
  pointerCursors,
  dockIcon,
  diffMarkers,
  fileIconTheme,
  sidebarNavigationLayout,
  sidebarNavigationVisibilitySettings,
  filesVisibilitySettings,
  externalAppsSettings,
  experimentalSettings,
  rightSidebarToolsSettings,
  titlebarActionsSettings,
  aiEditAssistEnabled,
  cloudEnabled,
  cloudSession,
  cloudSessionRestoring,
  cloudApiBaseUrl,
  puppyoneConfig,
  puppyoneConfigLoading,
  puppyoneConfigSaving,
  puppyoneConfigError,
  updateState,
  onThemeModeChange,
  onInterfaceStyleChange,
  onLightThemePresetChange,
  onDarkThemePresetChange,
  onLoadingAnimationPresetChange,
  onTextSizeChange,
  onTypographyPreferencesChange,
  onPointerCursorsChange,
  onDockIconChange,
  onDiffMarkersChange,
  onFileIconThemeChange,
  onSidebarNavigationLayoutChange,
  onSidebarNavigationVisibilitySettingsChange,
  onFilesVisibilitySettingsChange,
  onExternalAppsSettingsChange,
  onExperimentalSettingsChange,
  onRightSidebarToolsSettingsChange,
  onTitlebarActionsSettingsChange,
  onAiEditAssistEnabledChange,
  onCloudSessionChange,
  onPuppyoneConfigChange,
  onUnlinkWorkspace,
  onRefreshGitStatus,
  onCheckForUpdates,
  onUpdateNow,
}: SettingsViewProps) {
  const { t } = useLocalization();
  const agentChatAvailable = useFeatureFlag("desktopAgentChat");
  const assetLibraryHomeAvailable = useFeatureFlag("assetLibraryHome");
  const [copiedRemoteKey, setCopiedRemoteKey] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const orderedHeaderElements = getOrderedHeaderElementDefinitions(titlebarActionsSettings.order);

  if (activeSection === "account") {
    return (
      <AccountSettingsView
        cloudSession={cloudSession}
        cloudSessionRestoring={cloudSessionRestoring}
        cloudApiBaseUrl={cloudApiBaseUrl}
        onCloudSessionChange={onCloudSessionChange}
      />
    );
  }

  const copyRemoteUrl = async (key: string, url: string) => {
    setCopyError(null);
    try {
      await writeClipboardText(url);
      setCopiedRemoteKey(key);
      window.setTimeout(() => setCopiedRemoteKey((current) => current === key ? null : current), 1500);
    } catch (error) {
      setCopyError(error instanceof Error ? error.message : String(error));
    }
  };

  if (activeSection === "git") {
    return (
      <GitSettingsView
        status={gitStatus}
        loading={gitStatusLoading}
        error={gitStatusError}
        copiedRemoteKey={copiedRemoteKey}
        copyError={copyError}
        onCopyRemoteUrl={copyRemoteUrl}
        onRefresh={onRefreshGitStatus}
      />
    );
  }

  if (activeSection === "cloud") {
    return (
      <CloudHostingSettingsView
        status={gitStatus}
        loading={gitStatusLoading}
        error={gitStatusError}
        copiedRemoteKey={copiedRemoteKey}
        copyError={copyError}
        puppyoneConfig={puppyoneConfig}
        puppyoneConfigLoading={puppyoneConfigLoading}
        puppyoneConfigSaving={puppyoneConfigSaving}
        puppyoneConfigError={puppyoneConfigError}
        cloudEnabled={cloudEnabled}
        onCopyRemoteUrl={copyRemoteUrl}
        onPuppyoneConfigChange={onPuppyoneConfigChange}
        onRefresh={onRefreshGitStatus}
      />
    );
  }

  if (activeSection === "files") {
    return (
      <FilesSettingsView
        settings={filesVisibilitySettings}
        onChange={onFilesVisibilitySettingsChange}
      />
    );
  }

  if (activeSection === "external-apps") {
    return (
      <DefaultAppsSettingsView
        settings={externalAppsSettings}
        onChange={onExternalAppsSettingsChange}
      />
    );
  }

  if (activeSection === "experimental") {
    return (
      <ExperimentalSettingsView
        settings={experimentalSettings}
        agentChatAvailable={agentChatAvailable}
        assetLibraryHomeAvailable={assetLibraryHomeAvailable}
        onChange={onExperimentalSettingsChange}
      />
    );
  }

  if (activeSection === "editor") {
    return (
      <EditorSettingsView
        aiEditAssistEnabled={aiEditAssistEnabled}
        diffMarkers={diffMarkers}
        onAiEditAssistEnabledChange={onAiEditAssistEnabledChange}
        onDiffMarkersChange={onDiffMarkersChange}
      />
    );
  }

  if (activeSection === "language") {
    return <LanguageSettingsView />;
  }

  if (activeSection === "appearance") {
    return (
      <section className="desktop-utility-view desktop-settings-view">
        <div className="desktop-utility-body desktop-settings-body">
          <div className="desktop-settings-section">
            <SettingsSectionHeader
              title={t("settings.appearance.title")}
              detail={t("settings.appearance.detail")}
            />
            <div className="desktop-settings-list">
              <InterfaceStyleSetting value={interfaceStyle} onChange={onInterfaceStyleChange} />
              <InterfacePaletteSettings
                interfaceStyle={interfaceStyle}
                themeMode={themeMode}
                lightThemePreset={lightThemePreset}
                darkThemePreset={darkThemePreset}
                onThemeModeChange={onThemeModeChange}
                onLightThemePresetChange={onLightThemePresetChange}
                onDarkThemePresetChange={onDarkThemePresetChange}
              />
              <div className="desktop-settings-row desktop-settings-row-control desktop-settings-wide-control-row">
                <span>{t("settings.appearance.loadingAnimation.title")}</span>
                <div
                  className="desktop-theme-segment desktop-loading-animation-segment"
                  aria-label={t("settings.appearance.loadingAnimation.ariaLabel")}
                >
                  {PULSE_GRID_PRESET_IDS.map((presetId) => (
                    <button
                      key={presetId}
                      className={loadingAnimationPreset === presetId ? "active" : ""}
                      type="button"
                      title={t(`settings.appearance.loadingAnimation.${presetId}.description`)}
                      aria-pressed={loadingAnimationPreset === presetId}
                      onClick={() => onLoadingAnimationPresetChange(presetId)}
                    >
                      <span className="desktop-loading-animation-preview" aria-hidden="true">
                        <PulseGrid
                          size="sm"
                          tone="neutral"
                          frames={PULSE_GRID_PRESET_FRAMES[presetId]}
                          ariaHidden
                        />
                      </span>
                      <span>{t(`settings.appearance.loadingAnimation.${presetId}.label`)}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="desktop-settings-row desktop-settings-row-control desktop-settings-wide-control-row">
                <span>{t("settings.appearance.textSize.title")}</span>
                <div className="desktop-theme-segment desktop-text-size-segment" aria-label={t("settings.appearance.textSize.ariaLabel")}>
                  {TEXT_SIZE_PRESETS.map((option) => (
                    <button
                      key={option.value}
                      className={textSize === option.value ? "active" : ""}
                      type="button"
                      title={t(`settings.appearance.textSize.${option.value}.description`)}
                      aria-pressed={textSize === option.value}
                      onClick={() => onTextSizeChange(option.value)}
                    >
                      <span>{t(`settings.appearance.textSize.${option.value}.label`)}</span>
                    </button>
                  ))}
                </div>
              </div>
              <ContentFontSetting
                preferences={typographyPreferences}
                onChange={onTypographyPreferencesChange}
              />
              <div className="desktop-settings-row desktop-settings-row-control desktop-settings-wide-control-row">
                <span>{t("settings.appearance.fileIcons.title")}</span>
                <div className="desktop-theme-segment desktop-file-icon-theme-segment" aria-label={t("settings.appearance.fileIcons.ariaLabel")}>
                  {FILE_ICON_THEMES.map((theme) => (
                    <button
                      key={theme.id}
                      className={fileIconTheme === theme.id ? "active" : ""}
                      type="button"
                      title={t(`settings.appearance.fileIcons.${theme.id}.description`)}
                      onClick={() => onFileIconThemeChange(theme.id)}
                    >
                      <FileGlyphIcon name="document.md" size={14} theme={theme.id} />
                      <span>{t(`settings.appearance.fileIcons.${theme.id}.label`)}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="desktop-settings-row desktop-settings-row-control desktop-settings-wide-control-row">
                <span>{t("settings.appearance.navigation.title")}</span>
                <div className="desktop-theme-segment desktop-sidebar-layout-segment" aria-label={t("settings.appearance.navigation.ariaLabel")}>
                  {SIDEBAR_NAVIGATION_LAYOUT_OPTIONS.map((option) => {
                    const Icon = option.placement === "top"
                      ? PanelTop
                      : option.placement === "left" ? PanelLeft : PanelBottom;
                    return (
                      <button
                        className={sidebarNavigationLayout === option.value ? "active" : ""}
                        type="button"
                        key={option.value}
                        title={t(`settings.appearance.navigation.${option.placement}.description`)}
                        onClick={() => onSidebarNavigationLayoutChange(option.value)}
                      >
                        <Icon size={14} />
                        <span>{t(`settings.appearance.navigation.${option.placement}.label`)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {experimentalSettings.enableViewerPlugins && (
                <div className="desktop-settings-row desktop-settings-row-control">
                  <span className="desktop-settings-label-stack">
                    <strong>{t("settings.appearance.pluginsShortcut.title")}</strong>
                    <small>{t("settings.appearance.pluginsShortcut.detail")}</small>
                  </span>
                  <label className="desktop-settings-switch">
                    <input
                      type="checkbox"
                      aria-label={t("settings.appearance.pluginsShortcut.title")}
                      checked={sidebarNavigationVisibilitySettings.enabled.plugins}
                      onChange={(event) => onSidebarNavigationVisibilitySettingsChange({
                        ...sidebarNavigationVisibilitySettings,
                        enabled: {
                          ...sidebarNavigationVisibilitySettings.enabled,
                          plugins: event.target.checked,
                        },
                      })}
                    />
                    <span aria-hidden="true" />
                  </label>
                </div>
              )}
              <div className="desktop-settings-row desktop-settings-row-control desktop-settings-wide-control-row desktop-settings-tools-row">
                <span>{t("settings.appearance.headerElements.title")}</span>
                <div className="desktop-settings-tool-list">
                  {orderedHeaderElements.map((element) => {
                    const Icon = element.icon;
                    const linkedToolId = element.linkedRightSidebarToolId;
                    const actionEnabled = linkedToolId
                      ? titlebarActionsSettings.enabled[element.id] && rightSidebarToolsSettings.enabled[linkedToolId]
                      : titlebarActionsSettings.enabled[element.id];
                    return (
                      <div
                        className="desktop-settings-tool-item"
                        key={element.id}
                      >
                        <span className="desktop-settings-tool-label">
                          <Icon size={14} />
                          <span>{t(`settings.appearance.headerElements.${element.id}`)}</span>
                        </span>
                        <label className="desktop-settings-switch">
                          <input
                            type="checkbox"
                            aria-label={t(`settings.appearance.headerElements.${element.id}`)}
                            checked={actionEnabled}
                            onChange={(event) => {
                              const enabled = event.target.checked;
                              onTitlebarActionsSettingsChange({
                                ...titlebarActionsSettings,
                                enabled: {
                                  ...titlebarActionsSettings.enabled,
                                  [element.id]: enabled,
                                },
                              });
                              if (linkedToolId && rightSidebarToolsSettings.enabled[linkedToolId] !== enabled) {
                                onRightSidebarToolsSettingsChange({
                                  ...rightSidebarToolsSettings,
                                  enabled: {
                                    ...rightSidebarToolsSettings.enabled,
                                    [linkedToolId]: enabled,
                                  },
                                });
                              }
                            }}
                          />
                          <span aria-hidden="true" />
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="desktop-settings-row desktop-settings-row-control">
                <span id="desktop-pointer-cursors-label">{t("settings.appearance.pointerCursors.title")}</span>
                <label
                  className="desktop-settings-switch"
                  title={t("settings.appearance.pointerCursors.detail")}
                >
                  <input
                    type="checkbox"
                    checked={pointerCursors}
                    aria-labelledby="desktop-pointer-cursors-label"
                    onChange={(event) => onPointerCursorsChange(event.target.checked)}
                  />
                  <span aria-hidden="true" />
                </label>
              </div>
              <div className="desktop-settings-row desktop-settings-row-control desktop-settings-wide-control-row">
                <span id="desktop-dock-icon-label">{t("settings.appearance.dockIcon.title")}</span>
                <div
                  className="desktop-theme-segment desktop-dock-icon-segment"
                  aria-labelledby="desktop-dock-icon-label"
                >
                  {DOCK_ICON_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      className={dockIcon === option.id ? "active" : ""}
                      type="button"
                      title={t(`settings.appearance.dockIcon.${option.id}.description`)}
                      aria-label={t(`settings.appearance.dockIcon.${option.id}.label`)}
                      aria-description={t(`settings.appearance.dockIcon.${option.id}.description`)}
                      aria-pressed={dockIcon === option.id}
                      onClick={() => onDockIconChange(option.id)}
                    >
                      <img src={option.previewSrc} alt="" />
                      <span>{t(`settings.appearance.dockIcon.${option.id}.label`)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <GeneralSettingsView
      workspace={workspace}
      updateState={updateState}
      onCheckForUpdates={onCheckForUpdates}
      onUpdateNow={onUpdateNow}
      onUnlinkWorkspace={onUnlinkWorkspace}
    />
  );
}
