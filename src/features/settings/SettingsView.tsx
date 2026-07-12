import { useEffect, useState } from "react";
import { Check, Cloud, Copy, ExternalLink, FileText, FlaskConical, GitBranch, LogIn, LogOut, Monitor, Moon, PanelBottom, PanelLeft, PanelTop, Pencil, RefreshCw, Settings, ShieldCheck, Sun, Unlink, UserRound } from "lucide-react";
import { FILE_ICON_THEMES, FileGlyphIcon } from "@puppyone/shared-ui";
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
import { SettingsGroup, SettingsLine, SettingsSectionHeader } from "./components";
import { ContentFontSetting } from "./ContentFontSetting";
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
      `Unlink "${workspace.name}" from puppyone? Local files will stay on disk. You will choose a folder again next time.`,
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

  if (activeSection === "appearance") {
    return (
      <section className="desktop-utility-view desktop-settings-view">
        <div className="desktop-utility-body desktop-settings-body">
          <div className="desktop-settings-section">
            <SettingsSectionHeader title="Appearance" detail="Local display preferences for this device." />
            <div className="desktop-settings-list">
              <div className="desktop-settings-row desktop-settings-row-control desktop-theme-mode-row">
                <span>Theme</span>
                <div className="desktop-theme-choice-list" aria-label="Theme mode">
                  {([
                    { value: "system", label: "System", icon: Monitor },
                    { value: "light", label: "Light", icon: Sun },
                    { value: "dark", label: "Dark", icon: Moon },
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
                          <span>{option.label}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="desktop-settings-row desktop-settings-row-control">
                <span>Light theme</span>
                <div className="desktop-theme-segment desktop-theme-preset-list" aria-label="Light theme preset">
                  {LIGHT_THEME_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      className={lightThemePreset === preset.id ? "active" : ""}
                      type="button"
                      title={preset.description}
                      aria-pressed={lightThemePreset === preset.id}
                      onClick={() => onLightThemePresetChange(preset.id)}
                    >
                      <span className="desktop-theme-preset-swatches" aria-hidden="true">
                        {preset.swatches.map((swatch) => (
                          <i key={swatch} style={{ background: swatch }} />
                        ))}
                      </span>
                      <span>{preset.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="desktop-settings-row desktop-settings-row-control">
                <span>Dark theme</span>
                <div className="desktop-theme-segment desktop-theme-preset-list" aria-label="Dark theme preset">
                  {DARK_THEME_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      className={darkThemePreset === preset.id ? "active" : ""}
                      type="button"
                      title={preset.description}
                      aria-pressed={darkThemePreset === preset.id}
                      onClick={() => onDarkThemePresetChange(preset.id)}
                    >
                      <span className="desktop-theme-preset-swatches" aria-hidden="true">
                        {preset.swatches.map((swatch) => (
                          <i key={swatch} style={{ background: swatch }} />
                        ))}
                      </span>
                      <span>{preset.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="desktop-settings-row desktop-settings-row-control">
                <span>Text size</span>
                <div className="desktop-theme-segment desktop-text-size-segment" aria-label="Text size">
                  {TEXT_SIZE_PRESETS.map((option) => (
                    <button
                      key={option.value}
                      className={textSize === option.value ? "active" : ""}
                      type="button"
                      title={option.description}
                      aria-pressed={textSize === option.value}
                      onClick={() => onTextSizeChange(option.value)}
                    >
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <ContentFontSetting
                preferences={typographyPreferences}
                onChange={onTypographyPreferencesChange}
              />
              <div className="desktop-settings-row desktop-settings-row-control">
                <span>File icons</span>
                <div className="desktop-theme-segment desktop-file-icon-theme-segment" aria-label="File icon theme">
                  {FILE_ICON_THEMES.map((theme) => (
                    <button
                      key={theme.id}
                      className={fileIconTheme === theme.id ? "active" : ""}
                      type="button"
                      title={theme.description}
                      onClick={() => onFileIconThemeChange(theme.id)}
                    >
                      <FileGlyphIcon name="document.md" size={14} theme={theme.id} />
                      <span>{theme.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="desktop-settings-row desktop-settings-row-control">
                <span>Navigation</span>
                <div className="desktop-theme-segment desktop-sidebar-layout-segment" aria-label="Sidebar navigation layout">
                  {SIDEBAR_NAVIGATION_LAYOUT_OPTIONS.map((option) => {
                    const Icon = option.placement === "top"
                      ? PanelTop
                      : option.placement === "left" ? PanelLeft : PanelBottom;
                    return (
                      <button
                        className={sidebarNavigationLayout === option.value ? "active" : ""}
                        type="button"
                        key={option.value}
                        title={option.description}
                        onClick={() => onSidebarNavigationLayoutChange(option.value)}
                      >
                        <Icon size={14} />
                        <span>{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {experimentalSettings.enableViewerPlugins && (
                <div className="desktop-settings-row desktop-settings-row-control">
                  <span className="desktop-settings-label-stack">
                    <strong>Plugins shortcut</strong>
                    <small>Show the local Plugins entry in workspace navigation.</small>
                  </span>
                  <label className="desktop-settings-switch">
                    <input
                      type="checkbox"
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
              <div className="desktop-settings-row desktop-settings-row-control desktop-settings-tools-row">
                <span>Header elements</span>
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
                          <span>{element.label}</span>
                        </span>
                        <label className="desktop-settings-switch">
                          <input
                            type="checkbox"
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
                <span id="desktop-pointer-cursors-label">Pointer cursors</span>
                <label
                  className="desktop-settings-switch"
                  title="Show a hand cursor over clickable controls."
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
              <div className="desktop-settings-row desktop-settings-row-control">
                <span id="desktop-dock-icon-label">Dock icon</span>
                <div
                  className="desktop-theme-segment desktop-dock-icon-segment"
                  aria-labelledby="desktop-dock-icon-label"
                >
                  {DOCK_ICON_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      className={dockIcon === option.id ? "active" : ""}
                      type="button"
                      title={option.description}
                      aria-label={option.label}
                      aria-description={option.description}
                      aria-pressed={dockIcon === option.id}
                      onClick={() => onDockIconChange(option.id)}
                    >
                      <img src={option.previewSrc} alt="" />
                      <span>{option.label}</span>
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
          <SettingsSectionHeader title="General" detail="Local project settings for this desktop app." />
          <div className="desktop-settings-list">
            <div className="desktop-settings-row">
              <span>Name</span>
              <strong>{workspace.name}</strong>
            </div>
            <div className="desktop-settings-row">
              <span>Path</span>
              <strong>{workspace.path}</strong>
            </div>
            <div className="desktop-settings-row">
              <span>Mode</span>
              <strong>Local</strong>
            </div>
            <div className="desktop-settings-row">
              <span>Status</span>
              <strong className="desktop-settings-status">
                <ShieldCheck size={14} />
                Protected
              </strong>
            </div>
            <DesktopUpdateSettingsRow
              state={updateState}
              onCheckForUpdates={onCheckForUpdates}
              onUpdateNow={onUpdateNow}
            />
            <div className="desktop-settings-row desktop-settings-row-control">
              <span>Project binding</span>
              <button
                className="desktop-settings-action danger"
                type="button"
                disabled={unlinking}
                title="Unlink workspace"
                onClick={() => void unlinkWorkspace()}
              >
                <Unlink size={14} />
                <span>{unlinking ? "Unlinking..." : "Unlink"}</span>
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
  const resolvedApiBaseUrl = cloudApiBaseUrl || getDesktopCloudApiBaseUrl();
  const [operation, setOperation] = useState<AccountAuthOperation | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const signedIn = Boolean(cloudSession);
  const accountStatus = cloudSessionRestoring
    ? "Restoring"
    : cloudSession?.status === "offline-authenticated"
      ? "Signed in — offline"
      : cloudSession?.status === "refreshing"
        ? "Refreshing"
        : cloudSession?.status === "signing-out"
          ? "Signing out"
          : signedIn
            ? "Signed in"
            : "Signed out";
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
      setAuthError("Desktop web sign-in is unavailable in this build.");
      return;
    }

    setOperation("signin");
    setAuthError(null);
    setAuthMessage(null);
    try {
      await startDesktopCloudOAuth(resolvedApiBaseUrl);
      setAuthMessage("Finish sign-in in your browser.");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to start web sign-in.");
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
      setAuthMessage("Signed out.");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Sign-out failed.");
    } finally {
      setOperation(null);
    }
  };

  return (
    <section className="desktop-utility-view desktop-settings-view">
      <div className="desktop-utility-body desktop-settings-body">
        <div className="desktop-settings-section desktop-account-settings-section">
          <SettingsSectionHeader title="Account" detail="Desktop account and Cloud service settings." />

          <SettingsGroup title="Puppyone account">
            <SettingsLine
              label="Status"
              value={accountStatus}
              tone={signedIn ? "success" : undefined}
              action={signedIn && !sessionMatchesService ? (
                <span className="desktop-settings-badge warning">Different service</span>
              ) : undefined}
            />
            <SettingsLine
              label="Email"
              value={cloudSession?.user_email ?? "Not signed in"}
            />
            <SettingsLine
              label="Desktop service"
              value={resolvedApiBaseUrl}
              title={resolvedApiBaseUrl}
              monospace
            />
            <SettingsLine
              label="Session service"
              value={cloudSession?.api_base_url ?? "None"}
              title={cloudSession?.api_base_url}
              monospace={Boolean(cloudSession?.api_base_url)}
            />
            <div className="desktop-settings-line desktop-settings-account-actions-line">
              <span>Authentication</span>
              <div className="desktop-settings-line-value desktop-settings-account-actions">
                {signedIn ? (
                  <button
                    className="desktop-settings-action danger"
                    type="button"
                    disabled={operation === "signout" || cloudSessionRestoring}
                    onClick={() => void signOut()}
                  >
                    <LogOut size={14} />
                    <span>{operation === "signout" ? "Signing out..." : "Sign out"}</span>
                  </button>
                ) : (
                  <button
                    className="desktop-settings-action primary"
                    type="button"
                    disabled={busy || !desktopOAuthAvailable}
                    onClick={() => void startWebSignIn()}
                  >
                    <LogIn size={14} />
                    <span>{operation === "signin" ? "Opening browser..." : "Sign in with browser"}</span>
                  </button>
                )}
              </div>
            </div>
            {(authError || authMessage) && (
              <div className={`desktop-settings-account-feedback ${authError ? "danger" : "success"}`}>
                {authError ?? authMessage}
              </div>
            )}
          </SettingsGroup>
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
  return (
    <section className="desktop-utility-view desktop-settings-view">
      <div className="desktop-utility-body desktop-settings-body">
        <div className="desktop-settings-section">
          <SettingsSectionHeader title="Editor" detail="Local editor and review preferences for this device." />
          <div className="desktop-settings-list">
            <div className="desktop-settings-row desktop-settings-row-control">
              <span className="desktop-settings-label-stack">
                <strong>AI edit assist</strong>
                <small>Show optional agent change markers and review card in editors. Off by default.</small>
              </span>
              <label className="desktop-settings-switch">
                <input
                  type="checkbox"
                  checked={aiEditAssistEnabled}
                  onChange={(event) => onAiEditAssistEnabledChange(event.target.checked)}
                />
                <span aria-hidden="true" />
              </label>
            </div>
            <div className="desktop-settings-row desktop-settings-row-control">
              <span className="desktop-settings-label-stack">
                <strong>Diff markers</strong>
                <small>Choose markers for compact AI reviews. Git Changes always shows +/−.</small>
              </span>
              <div className="desktop-theme-segment" aria-label="Diff markers">
                <button
                  type="button"
                  className={diffMarkers === "color" ? "active" : ""}
                  aria-pressed={diffMarkers === "color"}
                  onClick={() => onDiffMarkersChange("color")}
                >
                  <span>Color</span>
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
  return (
    <section className="desktop-utility-view desktop-settings-view">
      <div className="desktop-utility-body desktop-settings-body">
        <div className="desktop-settings-section">
          <SettingsSectionHeader
            title="Experimental"
            detail="Opt in to early desktop experiences. Every experiment is off by default."
          />
          <div className="desktop-settings-list">
            <div className="desktop-settings-row desktop-settings-row-control">
              <span className="desktop-settings-label-stack">
                <strong>Viewer plugins</strong>
                <small>Enable the experimental local-only Plugins page and its optional navigation shortcut.</small>
              </span>
              <label className="desktop-settings-switch">
                <input
                  type="checkbox"
                  checked={settings.enableViewerPlugins}
                  onChange={(event) => onChange({
                    ...settings,
                    enableViewerPlugins: event.target.checked,
                  })}
                />
                <span aria-hidden="true" />
              </label>
            </div>
            {assetLibraryHomeAvailable && (
              <div className="desktop-settings-row desktop-settings-row-control">
                <span className="desktop-settings-label-stack">
                  <strong>Projects homepage</strong>
                  <small>Try the experimental unified card layout for Cloud and local projects.</small>
                </span>
                <label className="desktop-settings-switch">
                  <input
                    type="checkbox"
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
                  <strong>Agent Chat</strong>
                  <small>Show the experimental Chat icon in the header. Terminal remains a separate button and stays available when this is off.</small>
                </span>
                <label className="desktop-settings-switch">
                  <input
                    type="checkbox"
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
                <strong>Puppyone App files</strong>
                <small>Show Puppyone App in New &gt; Custom files.</small>
              </span>
              <label className="desktop-settings-switch">
                <input
                  type="checkbox"
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
                <strong>PuppyFlow files</strong>
                <small>Show PuppyFlow in New &gt; Custom files.</small>
              </span>
              <label className="desktop-settings-switch">
                <input
                  type="checkbox"
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
          <SettingsSectionHeader title="Git Ignore" />

          <SettingsGroup title="Ignored files">
            <div className="desktop-settings-line desktop-settings-toggle-line desktop-files-toggle-line">
              <span>Show hidden files</span>
              <label className="desktop-settings-switch">
                <input
                  type="checkbox"
                  checked={settings.showHiddenFiles}
                  onChange={(event) => onChange({
                    ...settings,
                    showHiddenFiles: event.target.checked,
                  })}
                />
                <span aria-hidden="true" />
              </label>
            </div>
            <div className="desktop-settings-pattern-editor desktop-files-pattern-editor">
              <div className="desktop-files-pattern-editor-toolbar">
                <span>Exclude patterns</span>
                <small>{normalizedDraft.length} pattern{normalizedDraft.length === 1 ? "" : "s"}</small>
              </div>
              <textarea
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
                  <span>Apply</span>
                </button>
                <button
                  className="desktop-settings-row-action"
                  type="button"
                  onClick={resetPatterns}
                >
                  <RefreshCw size={13} />
                  <span>Reset</span>
                </button>
              </div>
            </div>
          </SettingsGroup>
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
  const [extensionDraft, setExtensionDraft] = useState("");
  const [choosingExtension, setChoosingExtension] = useState<string | null>(null);
  const [choiceError, setChoiceError] = useState<string | null>(null);
  const normalizedDraftExtension = normalizeExternalAppExtension(extensionDraft);

  const chooseDefaultAppForExtension = async (extensionValue: string) => {
    const extension = normalizeExternalAppExtension(extensionValue);
    if (!extension) {
      setChoiceError("Enter a file extension like md, pdf, or json.");
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
            title="Default Apps"
            detail="Choose which app opens each local file type."
          />

          <SettingsGroup title="System default">
            <SettingsLine
              label="Open mode"
              value="macOS default app"
              action={(
                <span className="desktop-settings-badge connected">System</span>
              )}
            />
            <div className="desktop-settings-line">
              <span className="desktop-settings-label-stack">
                <strong>Executable file protection</strong>
                <small>Always ask before opening files that may run code or install software.</small>
              </span>
              <span className="desktop-settings-badge connected">Always on</span>
            </div>
          </SettingsGroup>

          <SettingsGroup title="File type defaults">
            <div className="desktop-settings-line desktop-settings-default-app-add">
              <span className="desktop-settings-label-stack">
                <strong>Add file type</strong>
                <small>Use the extension without a dot.</small>
              </span>
              <div className="desktop-settings-line-value">
                <input
                  className="desktop-settings-text-input desktop-settings-extension-input"
                  type="text"
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
                  <span>{choosingExtension === normalizedDraftExtension ? "Choosing..." : "Choose App"}</span>
                </button>
              </div>
            </div>
            {settings.overrides.length === 0 ? (
              <div className="desktop-settings-muted-row">
                No custom defaults. Files open with the default app selected in macOS.
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
                      <small>{getExternalAppOverrideLabel(override.appPath, override.appName)}</small>
                    </span>
                    <span className="desktop-settings-row-action-group">
                      <button
                        className="desktop-settings-row-action"
                        type="button"
                        disabled={choosingExtension !== null}
                        onClick={() => void chooseDefaultAppForExtension(override.extension)}
                      >
                        Change
                      </button>
                      <button
                        className="desktop-settings-row-action"
                        type="button"
                        onClick={() => onChange(removeExternalAppOverride(settings, override.extension))}
                      >
                        Reset
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}
            {choiceError && <div className="desktop-settings-account-feedback danger">{choiceError}</div>}
          </SettingsGroup>
        </div>
      </div>
    </section>
  );
}

function getExternalAppOverrideLabel(appPath: string, appName?: string | null): string {
  if (appName?.trim()) return appName.trim();
  const leafName = appPath.replace(/\\/g, "/").split("/").pop();
  return leafName?.replace(/\.app$/i, "") || "Custom app";
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
              title="Cloud Hosting"
              detail="Choose the service Puppyone treats as this workspace's sync authority."
            />
            <button className="desktop-settings-action" type="button" onClick={onRefresh} disabled={loading}>
              <RefreshCw size={14} className={loading ? "spin" : undefined} />
              <span>Refresh</span>
            </button>
          </div>

          {error ? (
            <div className="desktop-utility-empty danger">{error}</div>
          ) : loading && !status ? (
            <div className="desktop-utility-empty">Reading Git...</div>
          ) : status && !status.isRepo ? (
            <div className="desktop-utility-empty">Not a Git repository.</div>
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
                <SettingsGroup title="Puppyone Cloud connection">
                  <SettingsLine
                    label="Status"
                    value={cloudInfo ? "Connected" : "Not configured"}
                    tone={cloudInfo ? "success" : undefined}
                  />
                  {cloudInfo ? (
                    <>
                      <SettingsLine label="Remote" value={cloudRemote?.name ?? "puppyone"} />
                      <SettingsLine label="Host" value={cloudInfo.host} />
                      <SettingsLine
                        label={cloudInfo.kind === "access-point" ? "Access key" : "Project"}
                        value={cloudInfo.displayId}
                        monospace
                      />
                      <SettingsLine
                        label="Connection URL"
                        value={cloudRemoteUrl ? maskRemoteUrl(cloudRemoteUrl) : "Not configured"}
                        title={cloudRemoteUrl ?? undefined}
                        monospace
                        action={cloudRemoteUrl ? (
                          <button
                            className="desktop-settings-row-action"
                            type="button"
                            onClick={() => void onCopyRemoteUrl(cloudCopyKey, cloudRemoteUrl)}
                          >
                            <Copy size={13} />
                            <span>{copiedRemoteKey === cloudCopyKey ? "Copied" : "Copy"}</span>
                          </button>
                        ) : undefined}
                      />
                    </>
                  ) : (
                    <div className="desktop-settings-muted-row">Not configured</div>
                  )}
                </SettingsGroup>
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
  const currentBranch = status?.branches.find((branch) => branch.current) ?? null;
  const remotes = status?.remotes ?? [];
  const localBranchCount = status?.branches.filter((branch) => !branch.remote).length ?? 0;
  const remoteBranchCount = status?.branches.filter((branch) => branch.remote).length ?? 0;

  return (
    <section className="desktop-utility-view desktop-settings-view">
      <div className="desktop-utility-body desktop-settings-body">
        <div className="desktop-settings-section">
          <div className="desktop-settings-heading-row">
            <SettingsSectionHeader title="Git" />
            <button className="desktop-settings-action" type="button" onClick={onRefresh} disabled={loading}>
              <RefreshCw size={14} className={loading ? "spin" : undefined} />
              <span>Refresh</span>
            </button>
          </div>

          {error ? (
            <div className="desktop-utility-empty danger">{error}</div>
          ) : loading && !status ? (
            <div className="desktop-utility-empty">Reading Git...</div>
          ) : status && !status.isRepo ? (
            <div className="desktop-utility-empty">Not a Git repository.</div>
          ) : (
            <>
              <SettingsGroup title="Repository">
                <SettingsLine label="Branch" value={status?.branch ?? "Detached"} />
                <SettingsLine label="Branches" value={`${localBranchCount} local, ${remoteBranchCount} remote`} />
                <SettingsLine label="Upstream" value={currentBranch?.upstream ?? "Not configured"} />
                <SettingsLine
                  label="Sync status"
                  value={currentBranch?.upstream ? `${currentBranch.ahead} ahead, ${currentBranch.behind} behind` : "Local only"}
                />
                <SettingsLine label="HEAD" value={status?.headCommitId ? shortCommit(status.headCommitId) : "No commits"} monospace />
              </SettingsGroup>

              <SettingsGroup title="Remotes">
                {remotes.length === 0 ? (
                  <div className="desktop-settings-muted-row">No remotes</div>
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
                          <strong>{remote.name}</strong>
                          <span className={`desktop-settings-badge ${remoteInfo ? "connected" : ""}`}>
                            {provider}
                          </span>
                        </div>
                        <div className="desktop-settings-remote-setting-meta">
                          <strong>{remote.branches.length}</strong>
                          <span>{remote.branches.length === 1 ? "branch" : "branches"}</span>
                        </div>
                        <div className="desktop-settings-remote-setting-url">
                          <code title={copyUrl ?? ""}>{copyUrl ? maskRemoteUrl(copyUrl) : "Not configured"}</code>
                          {pushUrlDiffers && remote.pushUrl && (
                            <small title={remote.pushUrl}>Push URL differs</small>
                          )}
                        </div>
                        <button
                          className="desktop-settings-row-action"
                          type="button"
                          disabled={!copyUrl}
                          onClick={() => copyUrl ? void onCopyRemoteUrl(copyKey, copyUrl) : undefined}
                        >
                          <Copy size={13} />
                          <span>{copiedRemoteKey === copyKey ? "Copied" : "Copy"}</span>
                        </button>
                      </div>
                    );
                  })
                )}
              </SettingsGroup>
              {copyError && <div className="desktop-utility-empty danger">{copyError}</div>}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export function SettingsSidebar({ activeSection, onSelectSection }: SettingsSidebarProps) {
  const settingsSections = [
    { id: "account", label: "Account", icon: UserRound, disabled: false },
    { id: "workspace", label: "General", icon: Settings, disabled: false },
    { id: "appearance", label: "Appearance", icon: Monitor, disabled: false },
    { id: "external-apps", label: "Default Apps", icon: ExternalLink, disabled: false },
    { id: "git", label: "Git", icon: GitBranch, disabled: false },
    { id: "files", label: "Git Ignore", icon: FileText, disabled: false },
    { id: "editor", label: "Editor", icon: Pencil, disabled: false },
    { id: "experimental", label: "Experimental", icon: FlaskConical, disabled: false },
    { id: "cloud", label: "Cloud Hosting", icon: Cloud, disabled: false },
  ] satisfies Array<{
    id: SettingsSection;
    label: string;
    icon: typeof Settings;
    disabled: boolean;
  }>;

  return (
    <section className="desktop-tool-sidebar desktop-settings-sidebar">
      <div className="desktop-tool-sidebar-list">
        {settingsSections.map((section) => {
          const Icon = section.icon;
          return (
            <div key={section.id}>
              <button
                className={`desktop-tool-sidebar-row ${section.id === activeSection ? "active" : ""}`}
                type="button"
                disabled={section.disabled}
                aria-disabled={section.disabled}
                title={section.disabled ? `${section.label} is not available yet` : section.label}
                onClick={() => onSelectSection(section.id)}
              >
                <Icon size={15} />
                <span>{section.label}</span>
              </button>
              {section.id === "account" && <div className="desktop-settings-sidebar-divider" aria-hidden="true" />}
              {section.id === "experimental" && <div className="desktop-settings-sidebar-divider cloud" aria-hidden="true" />}
            </div>
          );
        })}
      </div>
    </section>
  );
}
