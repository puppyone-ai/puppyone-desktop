import type { FileIconThemeId, Workspace } from "@puppyone/shared-ui";
import type { DesktopCloudSession } from "../../lib/cloudApi";
import type { DesktopUpdateState, GitStatusSnapshot, PuppyoneWorkspaceConfig } from "../../types/electron";
import type { DarkThemePreset, ExperimentalSettings, ExternalAppsSettings, FilesVisibilitySettings, LightThemePreset, RightSidebarToolsSettings, SidebarNavigationLayout, ThemeMode, TitlebarActionsSettings } from "../../preferences";

export type SettingsSection = "account" | "workspace" | "editor" | "git" | "cloud" | "appearance" | "files" | "external-apps" | "experimental";

export type SettingsViewProps = {
  workspace: Workspace;
  activeSection: SettingsSection;
  gitStatus: GitStatusSnapshot | null;
  gitStatusLoading: boolean;
  gitStatusError: string | null;
  themeMode: ThemeMode;
  lightThemePreset: LightThemePreset;
  darkThemePreset: DarkThemePreset;
  fileIconTheme: FileIconThemeId;
  sidebarNavigationLayout: SidebarNavigationLayout;
  filesVisibilitySettings: FilesVisibilitySettings;
  externalAppsSettings: ExternalAppsSettings;
  experimentalSettings: ExperimentalSettings;
  rightSidebarToolsSettings: RightSidebarToolsSettings;
  titlebarActionsSettings: TitlebarActionsSettings;
  aiEditAssistEnabled: boolean;
  cloudEnabled: boolean;
  cloudSession: DesktopCloudSession | null;
  cloudSessionRestoring: boolean;
  cloudApiBaseUrl: string | null;
  puppyoneConfig: PuppyoneWorkspaceConfig | null;
  puppyoneConfigLoading: boolean;
  puppyoneConfigSaving: boolean;
  puppyoneConfigError: string | null;
  updateState: DesktopUpdateState;
  onThemeModeChange: (mode: ThemeMode) => void;
  onLightThemePresetChange: (preset: LightThemePreset) => void;
  onDarkThemePresetChange: (preset: DarkThemePreset) => void;
  onFileIconThemeChange: (theme: FileIconThemeId) => void;
  onSidebarNavigationLayoutChange: (layout: SidebarNavigationLayout) => void;
  onFilesVisibilitySettingsChange: (settings: FilesVisibilitySettings) => void;
  onExternalAppsSettingsChange: (settings: ExternalAppsSettings) => void;
  onExperimentalSettingsChange: (settings: ExperimentalSettings) => void;
  onRightSidebarToolsSettingsChange: (settings: RightSidebarToolsSettings) => void;
  onTitlebarActionsSettingsChange: (settings: TitlebarActionsSettings) => void;
  onAiEditAssistEnabledChange: (enabled: boolean) => void;
  onCloudSessionChange: (session: DesktopCloudSession | null) => void;
  onPuppyoneConfigChange: (config: PuppyoneWorkspaceConfig) => Promise<PuppyoneWorkspaceConfig | null>;
  onUnlinkWorkspace: () => Promise<void>;
  onRefreshGitStatus: () => void;
  onCheckForUpdates: () => void;
  onUpdateNow: () => void;
};

export type SettingsSidebarProps = {
  activeSection: SettingsSection;
  onSelectSection: (section: SettingsSection) => void;
};
