import type { FileIconThemeId, Workspace } from "@puppyone/shared-ui";
import type {
  DarkThemePreset,
  CreateNewMenuSettings,
  DiffMarkers,
  DockIcon,
  ExperimentalSettings,
  ExternalAppsSettings,
  FilesVisibilitySettings,
  InterfaceStyle,
  GitSidebarLayout,
  LightThemePreset,
  LoadingAnimationPreset,
  LocalAgentsSettings,
  RightSidebarToolsSettings,
  SidebarNavigationLayout,
  SidebarNavigationVisibilitySettings,
  TextSize,
  TerminalSessionLayout,
  ThemeMode,
  TitlebarActionsSettings,
  TypographyPreferences,
} from "../../preferences";
import type { DesktopCloudSession } from "../../lib/cloudApi";
import type {
  DesktopUpdateState,
  GitStatusSnapshot,
  PuppyoneWorkspaceConfig,
} from "../../types/electron";
import { SettingsView } from "./SettingsView";
import type { ResolvedAppearance } from "../appearance/resolveAppearance";
import type { EditorPresentation } from "../appearance/interfaceStyles";
import { SettingsSidebar } from "./sidebar";
import type { SettingsSection } from "./types";

export type SettingsPreferencesPort = {
  themeMode: ThemeMode;
  interfaceStyle: InterfaceStyle;
  editorPresentation: EditorPresentation;
  resolvedAppearance: ResolvedAppearance;
  lightThemePreset: LightThemePreset;
  darkThemePreset: DarkThemePreset;
  loadingAnimationPreset: LoadingAnimationPreset;
  localAgentsSettings: LocalAgentsSettings;
  agentFileActivityIndicatorsEnabled: boolean;
  textSize: TextSize;
  typographyPreferences: TypographyPreferences;
  pointerCursors: boolean;
  dockIcon: DockIcon;
  diffMarkers: DiffMarkers;
  fileIconTheme: FileIconThemeId;
  sidebarNavigationLayout: SidebarNavigationLayout;
  sidebarNavigationVisibilitySettings: SidebarNavigationVisibilitySettings;
  filesVisibilitySettings: FilesVisibilitySettings;
  externalAppsSettings: ExternalAppsSettings;
  createNewMenuSettings: CreateNewMenuSettings;
  experimentalSettings: ExperimentalSettings;
  rightSidebarToolsSettings: RightSidebarToolsSettings;
  titlebarActionsSettings: TitlebarActionsSettings;
  terminalSessionLayout: TerminalSessionLayout;
  gitSidebarLayout: GitSidebarLayout;
  aiEditAssistEnabled: boolean;
  setThemeMode: (value: ThemeMode) => void;
  setInterfaceStyle: (value: InterfaceStyle) => void;
  setEditorPresentation: (value: EditorPresentation) => void;
  setLightThemePreset: (value: LightThemePreset) => void;
  setDarkThemePreset: (value: DarkThemePreset) => void;
  setLoadingAnimationPreset: (value: LoadingAnimationPreset) => void;
  setLocalAgentsSettings: (value: LocalAgentsSettings) => void;
  setAgentFileActivityIndicatorsEnabled: (value: boolean) => void;
  setTextSize: (value: TextSize) => void;
  setTypographyPreferences: (value: TypographyPreferences) => void;
  setPointerCursors: (value: boolean) => void;
  setDockIcon: (value: DockIcon) => void;
  setDiffMarkers: (value: DiffMarkers) => void;
  setFileIconTheme: (value: FileIconThemeId) => void;
  setSidebarNavigationLayout: (value: SidebarNavigationLayout) => void;
  setSidebarNavigationVisibilitySettings: (value: SidebarNavigationVisibilitySettings) => void;
  setExternalAppsSettings: (value: ExternalAppsSettings) => void;
  setCreateNewMenuSettings: (value: CreateNewMenuSettings) => void;
  setExperimentalSettings: (value: ExperimentalSettings) => void;
  setRightSidebarToolsSettings: (value: RightSidebarToolsSettings) => void;
  setTitlebarActionsSettings: (value: TitlebarActionsSettings) => void;
  setTerminalSessionLayout: (value: TerminalSessionLayout) => void;
  setGitSidebarLayout: (value: GitSidebarLayout) => void;
  setAiEditAssistEnabled: (value: boolean) => void;
};

export type SettingsWorkspaceSurfaceProps = {
  workspace: Workspace;
  activeSection: SettingsSection;
  onSelectSection: (section: SettingsSection) => void;
  preferences: SettingsPreferencesPort;
  onFilesVisibilitySettingsChange: (settings: FilesVisibilitySettings) => void;
  git: {
    status: GitStatusSnapshot | null;
    loading: boolean;
    error: string | null;
    refresh: () => void;
  };
  cloud: {
    enabled: boolean;
    session: DesktopCloudSession | null;
    sessionRestoring: boolean;
    apiBaseUrl: string | null;
    onSessionChange: (session: DesktopCloudSession | null) => void;
  };
  workspaceConfig: {
    value: PuppyoneWorkspaceConfig | null;
    loading: boolean;
    saving: boolean;
    error: string | null;
    change: (config: PuppyoneWorkspaceConfig) => Promise<PuppyoneWorkspaceConfig | null>;
    unlink: () => Promise<void>;
  };
  updates: {
    state: DesktopUpdateState;
    check: () => unknown;
    install: () => unknown;
  };
};

export function createSettingsWorkspaceSurface({
  activeSection,
  cloud,
  git,
  onFilesVisibilitySettingsChange,
  onSelectSection,
  preferences,
  updates,
  workspace,
  workspaceConfig,
}: SettingsWorkspaceSurfaceProps) {
  return {
    sidebar: <SettingsSidebar activeSection={activeSection} onSelectSection={onSelectSection} />,
    main: (
      <SettingsView
        workspace={workspace}
        activeSection={activeSection}
        gitStatus={git.status}
        gitStatusLoading={git.loading}
        gitStatusError={git.error}
        themeMode={preferences.themeMode}
        interfaceStyle={preferences.interfaceStyle}
        resolvedAppearance={preferences.resolvedAppearance}
        lightThemePreset={preferences.lightThemePreset}
        darkThemePreset={preferences.darkThemePreset}
        loadingAnimationPreset={preferences.loadingAnimationPreset}
        localAgentsSettings={preferences.localAgentsSettings}
        agentFileActivityIndicatorsEnabled={preferences.agentFileActivityIndicatorsEnabled}
        textSize={preferences.textSize}
        typographyPreferences={preferences.typographyPreferences}
        pointerCursors={preferences.pointerCursors}
        dockIcon={preferences.dockIcon}
        diffMarkers={preferences.diffMarkers}
        fileIconTheme={preferences.fileIconTheme}
        sidebarNavigationLayout={preferences.sidebarNavigationLayout}
        sidebarNavigationVisibilitySettings={preferences.sidebarNavigationVisibilitySettings}
        filesVisibilitySettings={preferences.filesVisibilitySettings}
        externalAppsSettings={preferences.externalAppsSettings}
        createNewMenuSettings={preferences.createNewMenuSettings}
        experimentalSettings={preferences.experimentalSettings}
        rightSidebarToolsSettings={preferences.rightSidebarToolsSettings}
        titlebarActionsSettings={preferences.titlebarActionsSettings}
        terminalSessionLayout={preferences.terminalSessionLayout}
        gitSidebarLayout={preferences.gitSidebarLayout}
        aiEditAssistEnabled={preferences.aiEditAssistEnabled}
        cloudEnabled={cloud.enabled}
        cloudSession={cloud.session}
        cloudSessionRestoring={cloud.sessionRestoring}
        cloudApiBaseUrl={cloud.apiBaseUrl}
        puppyoneConfig={workspaceConfig.value}
        puppyoneConfigLoading={workspaceConfig.loading}
        puppyoneConfigSaving={workspaceConfig.saving}
        puppyoneConfigError={workspaceConfig.error}
        updateState={updates.state}
        onThemeModeChange={preferences.setThemeMode}
        onInterfaceStyleChange={preferences.setInterfaceStyle}
        onEditorPresentationChange={preferences.setEditorPresentation}
        onLightThemePresetChange={preferences.setLightThemePreset}
        onDarkThemePresetChange={preferences.setDarkThemePreset}
        onLoadingAnimationPresetChange={preferences.setLoadingAnimationPreset}
        onLocalAgentsSettingsChange={preferences.setLocalAgentsSettings}
        onAgentFileActivityIndicatorsEnabledChange={preferences.setAgentFileActivityIndicatorsEnabled}
        onTextSizeChange={preferences.setTextSize}
        onTypographyPreferencesChange={preferences.setTypographyPreferences}
        onPointerCursorsChange={preferences.setPointerCursors}
        onDockIconChange={preferences.setDockIcon}
        onDiffMarkersChange={preferences.setDiffMarkers}
        onFileIconThemeChange={preferences.setFileIconTheme}
        onSidebarNavigationLayoutChange={preferences.setSidebarNavigationLayout}
        onSidebarNavigationVisibilitySettingsChange={preferences.setSidebarNavigationVisibilitySettings}
        onFilesVisibilitySettingsChange={onFilesVisibilitySettingsChange}
        onExternalAppsSettingsChange={preferences.setExternalAppsSettings}
        onCreateNewMenuSettingsChange={preferences.setCreateNewMenuSettings}
        onExperimentalSettingsChange={preferences.setExperimentalSettings}
        onRightSidebarToolsSettingsChange={preferences.setRightSidebarToolsSettings}
        onTitlebarActionsSettingsChange={preferences.setTitlebarActionsSettings}
        onTerminalSessionLayoutChange={preferences.setTerminalSessionLayout}
        onGitSidebarLayoutChange={preferences.setGitSidebarLayout}
        onAiEditAssistEnabledChange={preferences.setAiEditAssistEnabled}
        onCloudSessionChange={cloud.onSessionChange}
        onPuppyoneConfigChange={workspaceConfig.change}
        onUnlinkWorkspace={workspaceConfig.unlink}
        onRefreshGitStatus={git.refresh}
        onCheckForUpdates={() => void updates.check()}
        onUpdateNow={() => void updates.install()}
      />
    ),
  } as const;
}
