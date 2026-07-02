import { useCallback, useState, type ComponentProps } from "react";
import { DataWorkspace, type AiEditRequest, type DataNode, type Workspace } from "@puppyone/shared-ui";
import { AiResponseChangesCard } from "../../ai-edits/AiResponseChangesCard";
import { GitSidebar, GitStatusView } from "../source-control";
import type { DesktopGitController } from "../source-control/useDesktopGitController";
import { SettingsSidebar, SettingsView, type SettingsSection } from "../settings";
import {
  DesktopCloudAccessSidebar,
  CloudServiceMainView,
  CloudServiceSidebar,
  DesktopCloudAccessView,
  DesktopCloudIntegrationsSidebar,
  type CloudAccessFilter,
  type CloudWorkspaceSection,
} from "../cloud";
import { getGitHostingMode } from "../source-control/viewModel";
import type { DesktopView } from "../../components/DesktopCloudShell";
import type { useDesktopUpdates } from "../../components/DesktopUpdateControls";
import type { DesktopCloudSession } from "../../lib/cloudApi";
import { openExternalUrl } from "../../lib/localFiles";
import type { FilesVisibilitySettings } from "../../preferences";
import type { GitStatusSnapshot, PuppyoneWorkspaceConfig } from "../../types/electron";
import { DesktopExplorerRowActions } from "../data-workspace/nodeActions";
import type { DesktopPreferencesController } from "./useDesktopPreferences";
import {
  COLLAPSED_EXPLORER_WIDTH,
  MAX_EXPLORER_WIDTH,
  MIN_EXPLORER_WIDTH,
} from "./preferences";
import {
  DesktopSidebarFooterNavigation,
  DesktopSidebarTopNavigation,
} from "./navigation";

type DataWorkspacePort = ComponentProps<typeof DataWorkspace>["dataPort"];
type DesktopUpdatesController = ReturnType<typeof useDesktopUpdates>;

type DesktopWorkspaceContentProps = {
  activeAiEditRequest: AiEditRequest | null;
  activeDataPath: string | null;
  activeView: DesktopView;
  cloud: {
    activeSection: CloudWorkspaceSection;
    backupError: string | null;
    backupLoading: boolean;
    cloudApiBaseUrl: string | null;
    cloudSession: DesktopCloudSession | null;
    storedCloudSession: DesktopCloudSession | null;
    enabled: boolean;
    projectId: string | null;
    sessionRestoring: boolean;
    onCloudSessionChange: (session: DesktopCloudSession | null) => void;
    onConfigureCloudRemote: (remoteUrl: string) => Promise<GitStatusSnapshot | null>;
    onOpenDetails: () => void;
    onOpenGitSettings: () => void;
    onSelectSection: (section: CloudWorkspaceSection) => void;
    onStartPuppyoneBackup: () => void;
  };
  dataPort: DataWorkspacePort | null;
  desktopUpdates: DesktopUpdatesController;
  git: DesktopGitController;
  onActiveDataPathChange: (path: string | null) => void;
  onCreateEntryMenu: (parentPath: string | null, anchorRect: DOMRect) => void;
  onFilesVisibilitySettingsChange: (settings: FilesVisibilitySettings) => void;
  onNavigate: (view: DesktopView) => void;
  onNodeActionMenu: (node: DataNode, anchorRect: DOMRect) => void;
  onOpenSettings: () => void;
  onPuppyoneConfigChange: (config: PuppyoneWorkspaceConfig) => Promise<PuppyoneWorkspaceConfig | null>;
  onSelectSettingsSection: (section: SettingsSection) => void;
  onUnlinkWorkspace: () => Promise<void>;
  preferences: DesktopPreferencesController;
  puppyoneConfig: PuppyoneWorkspaceConfig | null;
  puppyoneConfigError: string | null;
  puppyoneConfigLoading: boolean;
  puppyoneConfigSaving: boolean;
  settingsSection: SettingsSection;
  workspace: Workspace;
  workspaceKind?: "local" | "cloud";
  workspaceKey: string;
  workspaceRefreshToken: number;
};

export function DesktopWorkspaceContent({
  activeAiEditRequest,
  activeDataPath,
  activeView,
  cloud,
  dataPort,
  desktopUpdates,
  git,
  onActiveDataPathChange,
  onCreateEntryMenu,
  onFilesVisibilitySettingsChange,
  onNavigate,
  onNodeActionMenu,
  onOpenSettings,
  onPuppyoneConfigChange,
  onSelectSettingsSection,
  onUnlinkWorkspace,
  preferences,
  puppyoneConfig,
  puppyoneConfigError,
  puppyoneConfigLoading,
  puppyoneConfigSaving,
  settingsSection,
  workspace,
  workspaceKind = "local",
  workspaceKey,
  workspaceRefreshToken,
}: DesktopWorkspaceContentProps) {
  const cloudWorkspace = workspaceKind === "cloud";
  const resolvedActiveView = cloudWorkspace && (activeView === "git" || activeView === "cloud")
    ? "data"
    : !cloudWorkspace && (activeView === "access" || activeView === "integrations") ? "data"
      : activeView === "cloud" && !cloud.enabled ? "data"
        : (activeView === "access" || activeView === "integrations") && !cloud.enabled ? "data" : activeView;
  const gitEnabled = !cloudWorkspace;
  const gitHostingMode = getGitHostingMode(git.activeGitStatus, puppyoneConfig);
  const workspaceChangeCount = gitEnabled
    ? getDesktopWorkspaceChangeCount(git.activeGitStatus, gitHostingMode === "github")
    : 0;
  const accessNavigationEnabled = cloud.enabled && cloudWorkspace && Boolean(cloud.projectId);
  const [activeCloudAccessFilter, setActiveCloudAccessFilter] = useState<CloudAccessFilter>("all");
  const [activeIntegrationProvider, setActiveIntegrationProvider] = useState<string | null>(null);
  const effectiveCloudAccessFilter: CloudAccessFilter = resolvedActiveView === "integrations"
    ? "integrations"
    : activeCloudAccessFilter === "integrations" ? "all" : activeCloudAccessFilter;
  const handleIntegrationProviderChange = useCallback((provider: string | null) => {
    setActiveIntegrationProvider(provider);
  }, []);
  const handleCloudAccessFilterChange = (filter: CloudAccessFilter) => {
    if (filter === "integrations") {
      setActiveCloudAccessFilter("all");
      setActiveIntegrationProvider(null);
      onNavigate("integrations");
      return;
    }
    setActiveCloudAccessFilter(filter);
    if (resolvedActiveView === "integrations") onNavigate("access");
  };

  const settingsView = (
    <SettingsView
      workspace={workspace}
      activeSection={settingsSection}
      gitStatus={git.activeGitStatus}
      gitStatusLoading={git.gitStatusLoading}
      gitStatusError={git.gitStatusError}
      themeMode={preferences.themeMode}
      fileIconTheme={preferences.fileIconTheme}
      sidebarNavigationLayout={preferences.sidebarNavigationLayout}
      filesVisibilitySettings={preferences.filesVisibilitySettings}
      rightSidebarToolsSettings={preferences.rightSidebarToolsSettings}
      aiEditAssistEnabled={preferences.aiEditAssistEnabled}
      cloudEnabled={cloud.enabled}
      cloudSession={cloud.storedCloudSession}
      cloudSessionRestoring={cloud.sessionRestoring}
      cloudApiBaseUrl={cloud.cloudApiBaseUrl}
      puppyoneConfig={puppyoneConfig}
      puppyoneConfigLoading={puppyoneConfigLoading}
      puppyoneConfigSaving={puppyoneConfigSaving}
      puppyoneConfigError={puppyoneConfigError}
      updateState={desktopUpdates.state}
      onThemeModeChange={preferences.setThemeMode}
      onFileIconThemeChange={preferences.setFileIconTheme}
      onSidebarNavigationLayoutChange={preferences.setSidebarNavigationLayout}
      onFilesVisibilitySettingsChange={onFilesVisibilitySettingsChange}
      onRightSidebarToolsSettingsChange={preferences.setRightSidebarToolsSettings}
      onAiEditAssistEnabledChange={preferences.setAiEditAssistEnabled}
      onCloudSessionChange={cloud.onCloudSessionChange}
      onPuppyoneConfigChange={onPuppyoneConfigChange}
      onUnlinkWorkspace={onUnlinkWorkspace}
      onRefreshGitStatus={git.refreshGitStatus}
      onCheckForUpdates={() => void desktopUpdates.checkForUpdates()}
      onUpdateNow={() => void desktopUpdates.updateNow()}
    />
  );

  const gitStatusView = (
    <GitStatusView
      workspace={workspace}
      status={git.activeGitStatus}
      activePanel={git.gitMainPanel}
      selectedCommitId={git.selectedGitCommitId}
      selectedWorkingFile={git.selectedGitWorkingFile}
      commitDetail={git.gitCommitDetail}
      commitDetailLoading={git.gitCommitDetailLoading}
      commitDetailError={git.gitCommitDetailError}
      workingFileDiff={git.gitWorkingFileDiff}
      workingFileDiffLoading={git.gitWorkingFileDiffLoading}
      workingFileDiffError={git.gitWorkingFileDiffError}
      operationLoading={git.gitOperationLoading}
      operationError={null}
      loading={git.gitStatusLoading}
      error={git.gitStatusError}
      onRefresh={git.refreshGitStatus}
      onSelectCommit={git.selectGitCommit}
      onStagePaths={git.handleStageGitPaths}
      onUnstagePaths={git.handleUnstageGitPaths}
      onDiscardPaths={git.handleDiscardGitPaths}
      onInitializeRepository={git.handleInitializeGitRepository}
    />
  );

  const cloudMainView = (
    <CloudServiceMainView
      workspace={workspace}
      status={git.activeGitStatus}
      puppyoneConfig={puppyoneConfig}
      cloudSession={cloud.storedCloudSession}
      sessionRestoring={cloud.sessionRestoring}
      onCloudSessionChange={cloud.onCloudSessionChange}
      activeSection={cloud.activeSection}
      loading={git.gitStatusLoading}
      error={git.gitStatusError}
      cloudBackupLoading={cloud.backupLoading}
      cloudBackupError={cloud.backupError}
      onStartPuppyoneBackup={cloud.onStartPuppyoneBackup}
      onConfigureCloudRemote={cloud.onConfigureCloudRemote}
      onSelectSection={cloud.onSelectSection}
      onRefresh={git.refreshGitStatus}
      onOpenDetails={cloud.onOpenDetails}
      onOpenGitSettings={cloud.onOpenGitSettings}
    />
  );

  const cloudAccessView = (
    <DesktopCloudAccessView
      projectId={cloud.projectId}
      cloudSession={cloud.cloudSession}
      activeFilter={effectiveCloudAccessFilter}
      activeIntegrationProvider={resolvedActiveView === "integrations" ? activeIntegrationProvider : null}
      sessionRestoring={cloud.sessionRestoring}
      onCloudSessionChange={cloud.onCloudSessionChange}
      onRefresh={() => undefined}
    />
  );

  if (!dataPort) {
    if (resolvedActiveView === "settings") return settingsView;
    if (resolvedActiveView === "git") return gitStatusView;
    if (resolvedActiveView === "cloud") return cloudMainView;
    if (resolvedActiveView === "access" || resolvedActiveView === "integrations") return cloudAccessView;
    return null;
  }

  return (
    <div className="desktop-data-workspace-wrap">
      <DataWorkspace
        key={workspaceKey}
        workspace={workspace}
        labels={{ root: workspace.name }}
        dataPort={dataPort}
        activePath={activeDataPath}
        onActivePathChange={onActiveDataPathChange}
        onOpenExternalUrl={openExternalUrl}
        resizableExplorer
        explorerCollapsed={false}
        explorerWidth={preferences.explorerWidth}
        minExplorerWidth={MIN_EXPLORER_WIDTH}
        maxExplorerWidth={MAX_EXPLORER_WIDTH}
        collapsedExplorerWidth={COLLAPSED_EXPLORER_WIDTH}
        onExplorerWidthChange={preferences.setExplorerWidth}
        showHeader={false}
        showExplorerToolbar={preferences.sidebarNavigationPlacement === "top"}
        explorerToolbarSlot={preferences.sidebarNavigationPlacement === "top" ? (
          <DesktopSidebarTopNavigation
            activeView={resolvedActiveView}
            accessEnabled={accessNavigationEnabled}
            gitEnabled={gitEnabled}
            orientation={preferences.sidebarNavigationOrientation}
            gitIncomingCount={git.gitIncomingCount}
            gitOperationLoading={git.gitOperationLoading}
            gitStatus={git.activeGitStatus}
            workspaceChangeCount={workspaceChangeCount}
            onNavigate={onNavigate}
            onOpenSettings={onOpenSettings}
          />
        ) : undefined}
        showPreviewHeader={false}
        hidePreviewSourceView
        fileIconTheme={preferences.fileIconTheme}
        editorSaveMode="auto"
        htmlTrustMode="localTrusted"
        aiEditRequest={activeAiEditRequest}
        enableMarkdownLinkContentIndexing={!cloudWorkspace}
        refreshKey={workspaceRefreshToken}
        explorerRootActionSlot={
          <DesktopExplorerRowActions
            parentPath={null}
            onCreate={onCreateEntryMenu}
            onOpenNodeMenu={onNodeActionMenu}
          />
        }
        explorerNodeActionSlot={(_state, node) => (
          <DesktopExplorerRowActions
            node={node}
            parentPath={node.type === "folder" ? node.path : null}
            onCreate={onCreateEntryMenu}
            onOpenNodeMenu={onNodeActionMenu}
          />
        )}
        explorerSlot={resolvedActiveView === "data" ? undefined : (
          <div className="desktop-view-surface desktop-view-surface-sidebar" data-view={resolvedActiveView}>
            {resolvedActiveView === "access" ? (
              <DesktopCloudAccessSidebar
                activeFilter={effectiveCloudAccessFilter}
                onSelectFilter={handleCloudAccessFilterChange}
              />
            ) : resolvedActiveView === "integrations" ? (
              <DesktopCloudIntegrationsSidebar
                projectId={cloud.projectId}
                cloudSession={cloud.cloudSession}
                activeProvider={activeIntegrationProvider}
                onCloudSessionChange={cloud.onCloudSessionChange}
                onSelectProvider={handleIntegrationProviderChange}
              />
            ) : resolvedActiveView === "git" ? (
              <GitSidebar
                status={git.activeGitStatus}
                puppyoneConfig={puppyoneConfig}
                gitDisplayMode={preferences.gitDisplayMode}
                fileIconTheme={preferences.fileIconTheme}
                activePanel={git.gitMainPanel}
                loading={git.gitStatusLoading}
                error={git.gitStatusError}
                selectedWorkingFile={git.selectedGitWorkingFile}
                operationLoading={git.gitOperationLoading}
                operationError={null}
                onSelectPanel={git.selectGitMainPanel}
                onSelectWorkingFile={git.selectGitWorkingFile}
                onStagePaths={git.handleStageGitPaths}
                onStageAll={git.handleStageAllGitChanges}
                onUnstagePaths={git.handleUnstageGitPaths}
                onUnstageAll={git.handleUnstageAllGitChanges}
                onDiscardPaths={git.handleDiscardGitPaths}
                onDiscardAll={git.handleDiscardAllGitChanges}
                onStageAndCommit={git.handleStageAndCommitGit}
                onCommit={git.handleCommitGit}
                onCommitAndPush={git.handleCommitAndPushGit}
                onPull={git.handlePullGit}
                onPush={git.handlePushGit}
                onPublish={git.handlePublishGitBranch}
                cloudBackupLoading={cloud.backupLoading}
                cloudBackupError={cloud.backupError}
                cloudEnabled={cloud.enabled}
                onStartPuppyoneBackup={cloud.onStartPuppyoneBackup}
                onInitializeRepository={git.handleInitializeGitRepository}
              />
            ) : resolvedActiveView === "cloud" ? (
              <CloudServiceSidebar
                status={git.activeGitStatus}
                cloudSession={cloud.storedCloudSession}
                activeSection={cloud.activeSection}
                onSelectSection={cloud.onSelectSection}
              />
            ) : (
              <SettingsSidebar
                activeSection={settingsSection}
                onSelectSection={onSelectSettingsSection}
              />
            )}
          </div>
        )}
        explorerFooterSlot={
          preferences.sidebarNavigationPlacement === "bottom" ? (
            <DesktopSidebarFooterNavigation
              activeView={resolvedActiveView}
              accessEnabled={accessNavigationEnabled}
              gitEnabled={gitEnabled}
              gitIncomingCount={git.gitIncomingCount}
              gitOperationLoading={git.gitOperationLoading}
              gitStatus={git.activeGitStatus}
              workspaceChangeCount={workspaceChangeCount}
              onNavigate={onNavigate}
              onOpenSettings={onOpenSettings}
            />
          ) : undefined
        }
        mainSlot={resolvedActiveView === "git" || resolvedActiveView === "settings" || resolvedActiveView === "cloud" || resolvedActiveView === "access" || resolvedActiveView === "integrations" ? (
          <div className="desktop-view-surface desktop-view-surface-main" data-view={resolvedActiveView}>
            {resolvedActiveView === "git"
              ? gitStatusView
              : resolvedActiveView === "cloud"
                ? cloudMainView
                : resolvedActiveView === "access" || resolvedActiveView === "integrations"
                  ? cloudAccessView
                  : settingsView}
          </div>
        ) : undefined}
        capabilities={{
          create: true,
          rename: true,
          delete: true,
          move: true,
          write: true,
          history: true,
          accessPoints: false,
          cloudSync: false,
          localGit: gitEnabled,
          connectors: false,
        }}
      />
      {activeAiEditRequest && resolvedActiveView === "data" && (
        <div className="desktop-ai-edit-review-floating">
          <AiResponseChangesCard
            request={activeAiEditRequest}
            activePath={activeDataPath}
            onOpenFile={onActiveDataPathChange}
          />
        </div>
      )}
    </div>
  );
}

function getDesktopWorkspaceChangeCount(
  status: GitStatusSnapshot | null,
  includeCommittedChanges: boolean,
) {
  if (!status?.isRepo) return 0;
  const localChangeCount =
    status.stagedEntries.length +
    status.unstagedEntries.length +
    status.untrackedEntries.length;
  const committedChangeCount = includeCommittedChanges
    ? Math.max(0, status.sourceControl.remote.ahead)
    : 0;
  return localChangeCount + committedChangeCount;
}
