import { useEffect, useState } from "react";
import { Check, Cloud, Copy, ExternalLink, FileText, FlaskConical, GitBranch, Languages, LogIn, LogOut, Monitor, Moon, PanelBottom, PanelLeft, PanelTop, Pencil, RefreshCw, Settings, ShieldCheck, Sun, Unlink, UserRound } from "lucide-react";
import { FILE_ICON_THEMES, FileGlyphIcon } from "@puppyone/shared-ui";
import { bidiIsolate, useLocalization } from "@puppyone/localization";
import { DesktopUpdateSettingsRow } from "../../components/DesktopUpdateControls";
import { getDesktopCloudApiBaseUrl, isCloudSessionForApiBase, type DesktopCloudSession } from "../../lib/cloudApi";
import { clearDesktopCloudSession, onDesktopCloudAuthError, startDesktopCloudOAuth, supportsDesktopCloudOAuth } from "../../lib/cloudSession";
import { chooseWorkspaceExternalApp } from "../../lib/localFiles";
import { DARK_THEME_PRESETS, DEFAULT_EXPLORER_EXCLUDE_PATTERNS, DOCK_ICON_OPTIONS, LIGHT_THEME_PRESETS, SIDEBAR_NAVIGATION_LAYOUT_OPTIONS, TEXT_SIZE_PRESETS, normalizeExplorerExcludePatterns, normalizeExternalAppExtension, removeExternalAppOverride, upsertExternalAppOverride, type DarkThemePreset, type DiffMarkers, type ExperimentalSettings, type ExternalAppsSettings, type FilesVisibilitySettings, type LightThemePreset, type ThemeMode, type TitlebarActionsSettings } from "../../preferences";
import type { GitStatusSnapshot, PuppyoneWorkspaceConfig } from "../../types/electron";
import { getOrderedHeaderElementDefinitions } from "../app-shell/headerElements";
import { ExternalAppIcon } from "../external-apps/ExternalAppIcon";
import { useFeatureFlag } from "../flags";
import { getPuppyoneRemote, maskRemoteUrl, parsePuppyoneRemote } from "../source-control/remotes";
import { SettingsSectionHeader, SettingsSubsection, SettingsValueRow } from "./components";
import { ContentFontSetting } from "./ContentFontSetting";
import { LanguageSettingsView } from "./LanguageSetting";
import { PuppyoneWorkspaceConfigSettings } from "./PuppyoneWorkspaceConfigSettings";
import type { SettingsSidebarProps, SettingsViewProps, SettingsSection } from "./types";
import { remoteKindLabel, shortCommit, writeClipboardText } from "./utils";

export function SettingsView({
  workspace,
  activeSection,
  gitStatus,
  gitStatusLoading,
  gitStatusError,
  themeMode,
  lightThemePreset,
  darkThemePreset,
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
  onLightThemePresetChange,
  onDarkThemePresetChange,
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
  onRegeneratePuppyoneProjectId,
  onUnlinkWorkspace,
  onRefreshGitStatus,
  onCheckForUpdates,
  onUpdateNow,
}: SettingsViewProps) {
  const { t } = useLocalization();
  const agentChatAvailable = useFeatureFlag("desktopAgentChat");
  const assetLibraryHomeAvailable = useFeatureFlag("assetLibraryHome");
  const [unlinking, setUnlinking] = useState(false);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);
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
        onRegeneratePuppyoneProjectId={onRegeneratePuppyoneProjectId}
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
              <div className="desktop-settings-row desktop-settings-row-control desktop-settings-wide-control-row desktop-theme-mode-row">
                <span>{t("settings.appearance.theme.title")}</span>
                <div className="desktop-theme-choice-list" aria-label={t("settings.appearance.theme.ariaLabel")}>
                  {([
                    { value: "system", labelId: "settings.appearance.theme.system", icon: Monitor },
                    { value: "light", labelId: "settings.appearance.theme.light", icon: Sun },
                    { value: "dark", labelId: "settings.appearance.theme.dark", icon: Moon },
                  ] as const).map((option) => {
                    const Icon = option.icon;
                    return (
                      <button
                        className={`desktop-theme-choice ${themeMode === option.value ? "active" : ""}`}
                        type="button"
                        key={option.value}
                        aria-pressed={themeMode === option.value}
                        onClick={() => onThemeModeChange(option.value)}
                      >
                        <ThemePreview
                          mode={option.value}
                          lightThemePreset={lightThemePreset}
                          darkThemePreset={darkThemePreset}
                        />
                        <span className="desktop-theme-choice-label">
                          <Icon size={13} />
                          <span>{t(option.labelId)}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="desktop-settings-row desktop-settings-row-control desktop-settings-wide-control-row">
                <span>{t("settings.appearance.lightTheme.title")}</span>
                <div className="desktop-theme-segment desktop-theme-preset-list" aria-label={t("settings.appearance.lightTheme.ariaLabel")}>
                  {LIGHT_THEME_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      className={lightThemePreset === preset.id ? "active" : ""}
                      type="button"
                      title={t(`settings.appearance.lightTheme.${preset.id}.description`)}
                      aria-pressed={lightThemePreset === preset.id}
                      onClick={() => onLightThemePresetChange(preset.id)}
                    >
                      <span className="desktop-theme-preset-swatches" aria-hidden="true">
                        {preset.swatches.map((swatch) => (
                          <i key={swatch} style={{ background: swatch }} />
                        ))}
                      </span>
                      <span>{t(`settings.appearance.lightTheme.${preset.id}.label`)}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="desktop-settings-row desktop-settings-row-control desktop-settings-wide-control-row">
                <span>{t("settings.appearance.darkTheme.title")}</span>
                <div className="desktop-theme-segment desktop-theme-preset-list" aria-label={t("settings.appearance.darkTheme.ariaLabel")}>
                  {DARK_THEME_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      className={darkThemePreset === preset.id ? "active" : ""}
                      type="button"
                      title={t(`settings.appearance.darkTheme.${preset.id}.description`)}
                      aria-pressed={darkThemePreset === preset.id}
                      onClick={() => onDarkThemePresetChange(preset.id)}
                    >
                      <span className="desktop-theme-preset-swatches" aria-hidden="true">
                        {preset.swatches.map((swatch) => (
                          <i key={swatch} style={{ background: swatch }} />
                        ))}
                      </span>
                      <span>{t(`settings.appearance.darkTheme.${preset.id}.label`)}</span>
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
    <section className="desktop-utility-view desktop-settings-view">
      <div className="desktop-utility-body desktop-settings-body">
        <div className="desktop-settings-section">
          <SettingsSectionHeader
            title={t("settings.general.title")}
            detail={t("settings.general.detail")}
          />
          <div className="desktop-settings-list">
            <div className="desktop-settings-row">
              <span>{t("settings.general.name")}</span>
              <strong dir="auto" title={workspace.name}>{workspace.name}</strong>
            </div>
            <div className="desktop-settings-row">
              <span>{t("settings.general.path")}</span>
              <strong dir="ltr" title={workspace.path}>{workspace.path}</strong>
            </div>
            <div className="desktop-settings-row">
              <span>{t("settings.general.mode")}</span>
              <strong>{t("settings.general.modeLocal")}</strong>
            </div>
            <div className="desktop-settings-row">
              <span>{t("settings.general.status")}</span>
              <strong className="desktop-settings-status">
                <ShieldCheck size={14} />
                {t("settings.general.protected")}
              </strong>
            </div>
            <DesktopUpdateSettingsRow
              state={updateState}
              onCheckForUpdates={onCheckForUpdates}
              onUpdateNow={onUpdateNow}
            />
            <div className="desktop-settings-row desktop-settings-row-control">
              <span>{t("settings.general.projectBinding")}</span>
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

function ThemePreview({
  mode,
  lightThemePreset,
  darkThemePreset,
}: {
  mode: ThemeMode;
  lightThemePreset: LightThemePreset;
  darkThemePreset: DarkThemePreset;
}) {
  return (
    <span className={`desktop-theme-preview ${mode === "system" ? "system" : ""}`} aria-hidden="true">
      {mode === "system" ? (
        <>
          <ThemePreviewSurface
            mode="light"
            lightThemePreset={lightThemePreset}
            darkThemePreset={darkThemePreset}
          />
          <ThemePreviewSurface
            mode="dark"
            lightThemePreset={lightThemePreset}
            darkThemePreset={darkThemePreset}
          />
        </>
      ) : (
        <ThemePreviewSurface
          mode={mode}
          lightThemePreset={lightThemePreset}
          darkThemePreset={darkThemePreset}
        />
      )}
    </span>
  );
}

function ThemePreviewSurface({
  mode,
  lightThemePreset,
  darkThemePreset,
}: {
  mode: Exclude<ThemeMode, "system">;
  lightThemePreset: LightThemePreset;
  darkThemePreset: DarkThemePreset;
}) {
  return (
    <span
      className={`desktop-theme-preview-surface ${mode === "dark" ? "dark" : ""}`}
      data-light-theme-preset={lightThemePreset}
      data-dark-theme-preset={darkThemePreset}
    >
      <i className="desktop-theme-preview-sidebar">
        <b />
        <b />
        <b />
      </i>
      <i className="desktop-theme-preview-panel">
        <b className="accent" />
        <b />
        <b />
      </i>
    </span>
  );
}

type AccountAuthOperation = "signin" | "signout";

function AccountSettingsView({
  cloudSession,
  cloudSessionRestoring,
  cloudApiBaseUrl,
  onCloudSessionChange,
}: {
  cloudSession: DesktopCloudSession | null;
  cloudSessionRestoring: boolean;
  cloudApiBaseUrl: string | null;
  onCloudSessionChange: (session: DesktopCloudSession | null) => void;
}) {
  const { t } = useLocalization();
  const resolvedApiBaseUrl = cloudApiBaseUrl || getDesktopCloudApiBaseUrl();
  const [operation, setOperation] = useState<AccountAuthOperation | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const signedIn = Boolean(cloudSession);
  const accountStatus = cloudSessionRestoring
    ? t("settings.account.status.restoring")
    : cloudSession?.status === "offline-authenticated"
      ? t("settings.account.status.offline")
      : cloudSession?.status === "refreshing"
        ? t("settings.account.status.refreshing")
        : cloudSession?.status === "signing-out"
          ? t("settings.account.status.signingOut")
          : signedIn
            ? t("settings.account.status.signedIn")
            : t("settings.account.status.signedOut");
  const sessionMatchesService = !cloudSession || isCloudSessionForApiBase(cloudSession, resolvedApiBaseUrl);
  const desktopOAuthAvailable = supportsDesktopCloudOAuth();
  const busy = Boolean(operation) || cloudSessionRestoring;

  useEffect(() => {
    return onDesktopCloudAuthError((message) => {
      setOperation(null);
      setAuthMessage(null);
      setAuthError(message);
    });
  }, []);

  useEffect(() => {
    if (!cloudSession) return;
    setOperation((current) => current === "signin" ? null : current);
    setAuthError(null);
    setAuthMessage(null);
  }, [cloudSession]);

  const startWebSignIn = async () => {
    if (!desktopOAuthAvailable) {
      setAuthMessage(null);
      setAuthError(t("settings.account.error.oauthUnavailable"));
      return;
    }

    setOperation("signin");
    setAuthError(null);
    setAuthMessage(null);
    try {
      await startDesktopCloudOAuth(resolvedApiBaseUrl);
      setAuthMessage(t("settings.account.message.finishInBrowser"));
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : t("settings.account.error.signInStart"));
    } finally {
      window.setTimeout(() => {
        setOperation((current) => current === "signin" ? null : current);
      }, 1200);
    }
  };

  const signOut = async () => {
    if (operation === "signout") return;
    setOperation("signout");
    setAuthError(null);
    setAuthMessage(null);
    try {
      await clearDesktopCloudSession();
      onCloudSessionChange(null);
      setAuthMessage(t("settings.account.message.signedOut"));
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : t("settings.account.error.signOut"));
    } finally {
      setOperation(null);
    }
  };

  return (
    <section className="desktop-utility-view desktop-settings-view">
      <div className="desktop-utility-body desktop-settings-body">
        <div className="desktop-settings-section desktop-account-settings-section">
          <SettingsSectionHeader title={t("settings.account.title")} detail={t("settings.account.detail")} />

          <SettingsSubsection>
            <SettingsValueRow
              label={t("settings.account.statusLabel")}
              value={accountStatus}
              tone={signedIn ? "success" : undefined}
              action={signedIn && !sessionMatchesService ? (
                <span className="desktop-settings-badge warning">{t("settings.account.differentService")}</span>
              ) : undefined}
            />
            <SettingsValueRow
              label={t("settings.account.email")}
              value={cloudSession?.user_email ?? t("settings.account.notSignedIn")}
            />
            <SettingsValueRow
              label={t("settings.account.desktopService")}
              value={resolvedApiBaseUrl}
              title={resolvedApiBaseUrl}
              monospace
            />
            <SettingsValueRow
              label={t("settings.account.sessionService")}
              value={cloudSession?.api_base_url ?? t("settings.account.none")}
              title={cloudSession?.api_base_url}
              monospace={Boolean(cloudSession?.api_base_url)}
            />
            <div className="desktop-settings-row desktop-settings-row-control desktop-settings-account-actions-row">
              <span>{t("settings.account.authentication")}</span>
              <div className="desktop-settings-value desktop-settings-account-actions">
                {signedIn ? (
                  <button
                    className="desktop-settings-action danger"
                    type="button"
                    disabled={operation === "signout" || cloudSessionRestoring}
                    onClick={() => void signOut()}
                  >
                    <LogOut size={14} />
                    <span>{t(operation === "signout" ? "settings.account.signingOut" : "settings.account.signOut")}</span>
                  </button>
                ) : (
                  <button
                    className="desktop-settings-action primary"
                    type="button"
                    disabled={busy || !desktopOAuthAvailable}
                    onClick={() => void startWebSignIn()}
                  >
                    <LogIn size={14} />
                    <span>{t(operation === "signin" ? "settings.account.openingBrowser" : "settings.account.signInWithBrowser")}</span>
                  </button>
                )}
              </div>
            </div>
            {(authError || authMessage) && (
              <div className={`desktop-settings-account-feedback ${authError ? "danger" : "success"}`}>
                {authError ?? authMessage}
              </div>
            )}
          </SettingsSubsection>
        </div>
      </div>
    </section>
  );
}

function EditorSettingsView({
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
              <label className="desktop-settings-switch">
                <input
                  type="checkbox"
                  aria-label={t("settings.editor.aiAssist.title")}
                  checked={aiEditAssistEnabled}
                  onChange={(event) => onAiEditAssistEnabledChange(event.target.checked)}
                />
                <span aria-hidden="true" />
              </label>
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

function ExperimentalSettingsView({
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
  return (
    <section className="desktop-utility-view desktop-settings-view">
      <div className="desktop-utility-body desktop-settings-body">
        <div className="desktop-settings-section">
          <SettingsSectionHeader
            title={t("settings.experimental.title")}
            detail={t("settings.experimental.detail")}
          />
          <div className="desktop-settings-list">
            <div className="desktop-settings-row desktop-settings-row-control">
              <span className="desktop-settings-label-stack">
                <strong>{t("settings.experimental.minimalMode.title")}</strong>
                <small>{t("settings.experimental.minimalMode.detail")}</small>
              </span>
              <label className="desktop-settings-switch">
                <input
                  type="checkbox"
                  aria-label={t("settings.experimental.minimalMode.title")}
                  checked={settings.enableMinimalMode}
                  onChange={(event) => onChange({
                    ...settings,
                    enableMinimalMode: event.target.checked,
                  })}
                />
                <span aria-hidden="true" />
              </label>
            </div>
            <div className="desktop-settings-row desktop-settings-row-control">
              <span className="desktop-settings-label-stack">
                <strong>{t("settings.experimental.viewerPlugins.title")}</strong>
                <small>{t("settings.experimental.viewerPlugins.detail")}</small>
              </span>
              <label className="desktop-settings-switch">
                <input
                  type="checkbox"
                  aria-label={t("settings.experimental.viewerPlugins.title")}
                  checked={settings.enableViewerPlugins}
                  onChange={(event) => onChange({
                    ...settings,
                    enableViewerPlugins: event.target.checked,
                  })}
                />
                <span aria-hidden="true" />
              </label>
            </div>
            <div className="desktop-settings-row desktop-settings-row-control">
              <span className="desktop-settings-label-stack">
                <strong>{t("settings.experimental.markdownBlockDrag.title")}</strong>
                <small>{t("settings.experimental.markdownBlockDrag.detail")}</small>
              </span>
              <label className="desktop-settings-switch">
                <input
                  type="checkbox"
                  aria-label={t("settings.experimental.markdownBlockDrag.title")}
                  checked={settings.enableMarkdownBlockDrag}
                  onChange={(event) => onChange({
                    ...settings,
                    enableMarkdownBlockDrag: event.target.checked,
                  })}
                />
                <span aria-hidden="true" />
              </label>
            </div>
            {assetLibraryHomeAvailable && (
              <div className="desktop-settings-row desktop-settings-row-control">
                <span className="desktop-settings-label-stack">
                  <strong>{t("settings.experimental.projectsHome.title")}</strong>
                  <small>{t("settings.experimental.projectsHome.detail")}</small>
                </span>
                <label className="desktop-settings-switch">
                  <input
                    type="checkbox"
                    aria-label={t("settings.experimental.projectsHome.title")}
                    checked={settings.enableAssetLibraryHome}
                    onChange={(event) => onChange({
                      ...settings,
                      enableAssetLibraryHome: event.target.checked,
                    })}
                  />
                  <span aria-hidden="true" />
                </label>
              </div>
            )}
            {agentChatAvailable && (
              <div className="desktop-settings-row desktop-settings-row-control">
                <span className="desktop-settings-label-stack">
                  <strong>{t("settings.experimental.agentChat.title")}</strong>
                  <small>{t("settings.experimental.agentChat.detail")}</small>
                </span>
                <label className="desktop-settings-switch">
                  <input
                    type="checkbox"
                    aria-label={t("settings.experimental.agentChat.title")}
                    checked={settings.enableAgentChat}
                    onChange={(event) => onChange({
                      ...settings,
                      enableAgentChat: event.target.checked,
                    })}
                  />
                  <span aria-hidden="true" />
                </label>
              </div>
            )}
            <div className="desktop-settings-row desktop-settings-row-control">
              <span className="desktop-settings-label-stack">
                <strong>{t("settings.experimental.appFiles.title")}</strong>
                <small>{t("settings.experimental.appFiles.detail")}</small>
              </span>
              <label className="desktop-settings-switch">
                <input
                  type="checkbox"
                  aria-label={t("settings.experimental.appFiles.title")}
                  checked={settings.enablePuppyoneAppFiles}
                  onChange={(event) => onChange({
                    ...settings,
                    enablePuppyoneAppFiles: event.target.checked,
                  })}
                />
                <span aria-hidden="true" />
              </label>
            </div>
            <div className="desktop-settings-row desktop-settings-row-control">
              <span className="desktop-settings-label-stack">
                <strong>{t("settings.experimental.flowFiles.title")}</strong>
                <small>{t("settings.experimental.flowFiles.detail")}</small>
              </span>
              <label className="desktop-settings-switch">
                <input
                  type="checkbox"
                  aria-label={t("settings.experimental.flowFiles.title")}
                  checked={settings.enablePuppyFlowFiles}
                  onChange={(event) => onChange({
                    ...settings,
                    enablePuppyFlowFiles: event.target.checked,
                  })}
                />
                <span aria-hidden="true" />
              </label>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FilesSettingsView({
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

  useEffect(() => {
    setPatternDraft(savedPatternText);
  }, [savedPatternText]);

  const applyPatterns = () => {
    onChange({
      ...settings,
      excludePatterns: normalizedDraft,
    });
  };

  const resetPatterns = () => {
    const nextPatterns = [...DEFAULT_EXPLORER_EXCLUDE_PATTERNS];
    setPatternDraft(nextPatterns.join("\n"));
    onChange({
      ...settings,
      excludePatterns: nextPatterns,
    });
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
                  onChange={(event) => onChange({
                    ...settings,
                    showHiddenFiles: event.target.checked,
                  })}
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
                  <button
                    className="desktop-settings-row-action"
                    type="button"
                    disabled={!patternsDirty}
                    onClick={applyPatterns}
                  >
                    <Check size={13} />
                    <span>{t("common.action.apply")}</span>
                  </button>
                  <button
                    className="desktop-settings-row-action"
                    type="button"
                    onClick={resetPatterns}
                  >
                    <RefreshCw size={13} />
                    <span>{t("common.action.reset")}</span>
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

function DefaultAppsSettingsView({
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
          <SettingsSectionHeader
            title={t("settings.defaultApps.title")}
            detail={t("settings.defaultApps.detail")}
          />

          <SettingsSubsection title={t("settings.defaultApps.systemDefault")}>
            <SettingsValueRow
              label={t("settings.defaultApps.openMode")}
              value={t("settings.defaultApps.macosDefault")}
              action={(
                <span className="desktop-settings-badge connected">{t("settings.defaultApps.system")}</span>
              )}
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
                  onChange={(event) => {
                    setExtensionDraft(event.target.value);
                    setChoiceError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void chooseDefaultAppForExtension(extensionDraft);
                  }}
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
              <div className="desktop-settings-muted-row">
                {t("settings.defaultApps.empty")}
              </div>
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

function getExternalAppOverrideLabel(appPath: string, appName: string | null | undefined, fallback: string): string {
  if (appName?.trim()) return appName.trim();
  const leafName = appPath.replace(/\\/g, "/").split("/").pop();
  return leafName?.replace(/\.app$/i, "") || fallback;
}

function CloudHostingSettingsView({
  status,
  loading,
  error,
  copiedRemoteKey,
  copyError,
  puppyoneConfig,
  puppyoneConfigLoading,
  puppyoneConfigSaving,
  puppyoneConfigError,
  cloudEnabled,
  onCopyRemoteUrl,
  onPuppyoneConfigChange,
  onRegeneratePuppyoneProjectId,
  onRefresh,
}: {
  status: GitStatusSnapshot | null;
  loading: boolean;
  error: string | null;
  copiedRemoteKey: string | null;
  copyError: string | null;
  puppyoneConfig: PuppyoneWorkspaceConfig | null;
  puppyoneConfigLoading: boolean;
  puppyoneConfigSaving: boolean;
  puppyoneConfigError: string | null;
  cloudEnabled: boolean;
  onCopyRemoteUrl: (key: string, url: string) => Promise<void>;
  onPuppyoneConfigChange: (config: PuppyoneWorkspaceConfig) => Promise<PuppyoneWorkspaceConfig | null>;
  onRegeneratePuppyoneProjectId: () => Promise<PuppyoneWorkspaceConfig | null>;
  onRefresh: () => void;
}) {
  const { t } = useLocalization();
  const remotes = status?.remotes ?? [];
  const puppyoneRemote = remotes
    .map((remote) => ({ remote, info: parsePuppyoneRemote(remote.fetchUrl ?? remote.pushUrl) }))
    .find((entry) => entry.info);
  const cloudRemote = puppyoneRemote?.remote ?? null;
  const cloudInfo = puppyoneRemote?.info ?? null;
  const cloudRemoteUrl = cloudRemote ? cloudRemote.fetchUrl ?? cloudRemote.pushUrl : null;
  const cloudCopyKey = cloudRemoteUrl ? `${cloudRemote?.name}:${cloudRemoteUrl}` : "";
  const usesPuppyoneCloud = cloudEnabled
    && (puppyoneConfig?.sync.sourceOfTruth.service === "puppyone"
      || (puppyoneConfig?.backup.enabled === true && puppyoneConfig.backup.service === "puppyone"));

  return (
    <section className="desktop-utility-view desktop-settings-view">
      <div className="desktop-utility-body desktop-settings-body">
        <div className="desktop-settings-section">
          <div className="desktop-settings-heading-row">
            <SettingsSectionHeader
              title={t("settings.cloud.title")}
              detail={t("settings.cloud.detail")}
            />
            <button className="desktop-settings-action" type="button" onClick={onRefresh} disabled={loading}>
              <RefreshCw size={14} className={loading ? "spin" : undefined} />
              <span>{t("common.action.refresh")}</span>
            </button>
          </div>

          {error ? (
            <div className="desktop-utility-empty danger">{error}</div>
          ) : loading && !status ? (
            <div className="desktop-utility-empty">{t("settings.git.reading")}</div>
          ) : status && !status.isRepo ? (
            <div className="desktop-utility-empty">{t("settings.git.notRepository")}</div>
          ) : (
            <>
              <PuppyoneWorkspaceConfigSettings
                config={puppyoneConfig}
                remotes={remotes}
                branches={status?.branches ?? []}
                currentBranchName={status?.branch ?? null}
                cloudEnabled={cloudEnabled}
                loading={puppyoneConfigLoading}
                saving={puppyoneConfigSaving}
                error={puppyoneConfigError}
                onChange={onPuppyoneConfigChange}
                onRegenerateProjectId={onRegeneratePuppyoneProjectId}
              />

              {usesPuppyoneCloud && (
                <SettingsSubsection title={t("settings.cloud.connectionTitle")}>
                  <SettingsValueRow
                    label={t("settings.cloud.status")}
                    value={t(cloudInfo ? "settings.cloud.connected" : "settings.shared.notConfigured")}
                    tone={cloudInfo ? "success" : undefined}
                  />
                  {cloudInfo ? (
                    <>
                      <SettingsValueRow label={t("settings.cloud.remote")} value={cloudRemote?.name ?? "puppyone"} />
                      <SettingsValueRow label={t("settings.cloud.host")} value={cloudInfo.host} />
                      <SettingsValueRow
                        label={cloudInfo.kind === "access-point"
                          ? t("settings.cloud.accessKey")
                          : cloudInfo.kind === "scope"
                            ? t("settings.cloud.projectScope")
                            : t("settings.cloud.project")}
                        value={cloudInfo.displayId}
                        monospace
                      />
                      <SettingsValueRow
                        label={t("settings.cloud.connectionUrl")}
                        value={cloudRemoteUrl ? maskRemoteUrl(cloudRemoteUrl) : t("settings.shared.notConfigured")}
                        title={cloudRemoteUrl ?? undefined}
                        monospace
                        action={cloudRemoteUrl ? (
                          <button
                            className="desktop-settings-row-action"
                            type="button"
                            onClick={() => void onCopyRemoteUrl(cloudCopyKey, cloudRemoteUrl)}
                          >
                            <Copy size={13} />
                            <span>{t(copiedRemoteKey === cloudCopyKey ? "common.action.copied" : "common.action.copy")}</span>
                          </button>
                        ) : undefined}
                      />
                    </>
                  ) : (
                    <div className="desktop-settings-muted-row">{t("settings.shared.notConfigured")}</div>
                  )}
                </SettingsSubsection>
              )}

              {copyError && <div className="desktop-utility-empty danger">{copyError}</div>}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function GitSettingsView({
  status,
  loading,
  error,
  copiedRemoteKey,
  copyError,
  onCopyRemoteUrl,
  onRefresh,
}: {
  status: GitStatusSnapshot | null;
  loading: boolean;
  error: string | null;
  copiedRemoteKey: string | null;
  copyError: string | null;
  onCopyRemoteUrl: (key: string, url: string) => Promise<void>;
  onRefresh: () => void;
}) {
  const { t } = useLocalization();
  const currentBranch = status?.branches.find((branch) => branch.current) ?? null;
  const remotes = status?.remotes ?? [];
  const localBranchCount = status?.branches.filter((branch) => !branch.remote).length ?? 0;
  const remoteBranchCount = status?.branches.filter((branch) => branch.remote).length ?? 0;

  return (
    <section className="desktop-utility-view desktop-settings-view">
      <div className="desktop-utility-body desktop-settings-body">
        <div className="desktop-settings-section">
          <div className="desktop-settings-heading-row">
            <SettingsSectionHeader title={t("settings.git.title")} detail={t("settings.git.detail")} />
            <button className="desktop-settings-action" type="button" onClick={onRefresh} disabled={loading}>
              <RefreshCw size={14} className={loading ? "spin" : undefined} />
              <span>{t("common.action.refresh")}</span>
            </button>
          </div>

          {error ? (
            <div className="desktop-utility-empty danger">{error}</div>
          ) : loading && !status ? (
            <div className="desktop-utility-empty">{t("settings.git.reading")}</div>
          ) : status && !status.isRepo ? (
            <div className="desktop-utility-empty">{t("settings.git.notRepository")}</div>
          ) : (
            <>
              <SettingsSubsection title={t("settings.git.repository")}>
                <SettingsValueRow label={t("settings.git.branch")} value={status?.branch ?? t("settings.git.detached")} />
                <SettingsValueRow label={t("settings.git.branches")} value={t("settings.git.branchCounts", { localCount: localBranchCount, remoteCount: remoteBranchCount })} />
                <SettingsValueRow label={t("settings.git.upstream")} value={currentBranch?.upstream ?? t("settings.shared.notConfigured")} />
                <SettingsValueRow
                  label={t("settings.git.syncStatus")}
                  value={currentBranch?.upstream
                    ? t("settings.git.syncCounts", { ahead: currentBranch.ahead, behind: currentBranch.behind })
                    : t("settings.git.localOnly")}
                />
                <SettingsValueRow label="HEAD" value={status?.headCommitId ? shortCommit(status.headCommitId) : t("settings.git.noCommits")} monospace />
              </SettingsSubsection>

              <SettingsSubsection title={t("settings.git.remotes")}>
                {remotes.length === 0 ? (
                  <div className="desktop-settings-muted-row">{t("settings.git.noRemotes")}</div>
                ) : (
                  remotes.map((remote) => {
                    const copyUrl = remote.fetchUrl ?? remote.pushUrl;
                    const copyKey = `${remote.name}:${copyUrl ?? ""}`;
                    const remoteInfo = parsePuppyoneRemote(copyUrl);
                    const provider = remoteInfo ? "puppyone" : remoteKindLabel(copyUrl);
                    const pushUrlDiffers = Boolean(remote.fetchUrl && remote.pushUrl && remote.fetchUrl !== remote.pushUrl);
                    return (
                      <div className="desktop-settings-remote-setting" key={remote.name}>
                        <div className="desktop-settings-remote-setting-main">
                          <strong dir="auto">{remote.name}</strong>
                          <span className={`desktop-settings-badge ${remoteInfo ? "connected" : ""}`}>
                            {provider}
                          </span>
                        </div>
                        <div className="desktop-settings-remote-setting-meta">
                          <span>{t("settings.git.remoteBranchCount", { count: remote.branches.length })}</span>
                        </div>
                        <div className="desktop-settings-remote-setting-url">
                          <code dir="ltr" title={copyUrl ?? ""}>{copyUrl ? maskRemoteUrl(copyUrl) : t("settings.shared.notConfigured")}</code>
                          {pushUrlDiffers && remote.pushUrl && (
                            <small title={remote.pushUrl}>{t("settings.git.pushUrlDiffers")}</small>
                          )}
                        </div>
                        <button
                          className="desktop-settings-row-action"
                          type="button"
                          disabled={!copyUrl}
                          onClick={() => copyUrl ? void onCopyRemoteUrl(copyKey, copyUrl) : undefined}
                        >
                          <Copy size={13} />
                          <span>{t(copiedRemoteKey === copyKey ? "common.action.copied" : "common.action.copy")}</span>
                        </button>
                      </div>
                    );
                  })
                )}
              </SettingsSubsection>
              {copyError && <div className="desktop-utility-empty danger">{copyError}</div>}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

type SettingsSidebarItem = {
  id: SettingsSection;
  labelId: string;
  icon: typeof Settings;
  disabled: boolean;
};

type SettingsSidebarGroup = {
  id: string;
  labelId: string | null;
  items: readonly SettingsSidebarItem[];
};

const SETTINGS_SIDEBAR_GROUPS = [
  {
    id: "desktop-app",
    labelId: "settings.sidebar.desktopApp",
    items: [
      { id: "workspace", labelId: "settings.sidebar.general", icon: Settings, disabled: false },
      { id: "language", labelId: "settings.sidebar.language", icon: Languages, disabled: false },
      { id: "appearance", labelId: "settings.sidebar.appearance", icon: Monitor, disabled: false },
      { id: "external-apps", labelId: "settings.sidebar.defaultApps", icon: ExternalLink, disabled: false },
      { id: "editor", labelId: "settings.sidebar.editor", icon: Pencil, disabled: false },
      { id: "experimental", labelId: "settings.sidebar.experimental", icon: FlaskConical, disabled: false },
    ],
  },
  {
    id: "workspace",
    labelId: "settings.sidebar.workspace",
    items: [
      { id: "git", labelId: "settings.sidebar.git", icon: GitBranch, disabled: false },
      { id: "files", labelId: "settings.sidebar.gitIgnore", icon: FileText, disabled: false },
    ],
  },
  {
    id: "cloud",
    labelId: "settings.sidebar.cloud",
    items: [
      { id: "account", labelId: "settings.sidebar.account", icon: UserRound, disabled: false },
      { id: "cloud", labelId: "settings.sidebar.cloudHosting", icon: Cloud, disabled: false },
    ],
  },
] satisfies readonly SettingsSidebarGroup[];

export function SettingsSidebar({ activeSection, onSelectSection }: SettingsSidebarProps) {
  const { t } = useLocalization();

  return (
    <section className="desktop-tool-sidebar desktop-settings-sidebar">
      <div className="desktop-tool-sidebar-list">
        {SETTINGS_SIDEBAR_GROUPS.map((group) => {
          const labelId = group.labelId ? `desktop-settings-sidebar-group-${group.id}` : undefined;
          return (
            <div
              className="desktop-tool-sidebar-group"
              role="group"
              aria-label={group.labelId ? undefined : t("settings.sidebar.account")}
              aria-labelledby={labelId}
              key={group.id}
            >
              {group.labelId && (
                <div className="desktop-tool-sidebar-group-header">
                  <div className="desktop-tool-sidebar-group-title" id={labelId}>
                    {t(group.labelId)}
                  </div>
                </div>
              )}
              {group.items.map((section) => {
                const Icon = section.icon;
                return (
                  <button
                    className={`desktop-tool-sidebar-row ${section.id === activeSection ? "active" : ""}`}
                    type="button"
                    disabled={section.disabled}
                    aria-disabled={section.disabled}
                    title={section.disabled
                      ? t("settings.sidebar.notAvailable", { section: t(section.labelId) })
                      : t(section.labelId)}
                    onClick={() => onSelectSection(section.id)}
                    key={section.id}
                  >
                    <Icon size={15} />
                    <span>{t(section.labelId)}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}
