import type { FileIconThemeId, Workspace } from "@puppyone/shared-ui";
import type { DesktopCloudSession } from "../../lib/cloudApi";
import type { DesktopUpdateState, GitStatusSnapshot, PuppyoneWorkspaceConfig } from "../../types/electron";
import type { FilesVisibilitySettings, RightSidebarToolsSettings, SidebarNavigationLayout, ThemeMode } from "../../preferences";

export type SettingsSection = "account" | "workspace" | "editor" | "git" | "cloud" | "appearance" | "files";

export type SettingsViewProps = {
  workspace: Workspace;
  activeSection: SettingsSection;
  gitStatus: GitStatusSnapshot | null;
  gitStatusLoading: boolean;
  gitStatusError: string | null;
  themeMode: ThemeMode;
  fileIconTheme: FileIconThemeId;
  sidebarNavigationLayout: SidebarNavigationLayout;
  filesVisibilitySettings: FilesVisibilitySettings;
  rightSidebarToolsSettings: RightSidebarToolsSettings;
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
  onFileIconThemeChange: (theme: FileIconThemeId) => void;
  onSidebarNavigationLayoutChange: (layout: SidebarNavigationLayout) => void;
  onFilesVisibilitySettingsChange: (settings: FilesVisibilitySettings) => void;
  onRightSidebarToolsSettingsChange: (settings: RightSidebarToolsSettings) => void;
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
