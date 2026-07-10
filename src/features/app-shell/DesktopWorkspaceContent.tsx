import { useCallback, useEffect, useState, type ComponentProps, type MouseEvent as ReactMouseEvent } from "react";
import {
  DataWorkspace,
  EMPTY_VIEWER_PACK_SNAPSHOT,
  type AiEditRequest,
  type DataNode,
  type FilePreviewBodyContext,
  type ViewerPackSnapshot,
  type Workspace,
} from "@puppyone/shared-ui";
import { Plus } from "lucide-react";
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
import { useDesktopCloudAccessData } from "../cloud/data/useDesktopCloudAccessData";
import { isCloudAccessNavigationResource } from "../cloud/sections/access/accessRows";
import { getGitHostingMode } from "../source-control/viewModel";
import type { DesktopView } from "../../components/DesktopCloudShell";
import type { useDesktopUpdates } from "../../components/DesktopUpdateControls";
import type { DesktopCloudSession } from "../../lib/cloudApi";
import { openExternalUrl } from "../../lib/localFiles";
import type { FilesVisibilitySettings } from "../../preferences";
import type { FileClipboardController } from "../data-workspace/useFileClipboard";
import type { GitStatusSnapshot, PuppyoneWorkspaceConfig } from "../../types/electron";
import {
  DesktopExplorerRowActions,
  rectToCreateEntryAnchor,
  type DesktopCreateEntryAnchorInput,
} from "../data-workspace/nodeActions";
import { PuppyFlowEditor } from "../puppyflow/PuppyFlowEditor";
import { isPuppyFlowFile } from "../puppyflow/puppyflowModel";
import type { DesktopPreferencesController } from "./useDesktopPreferences";
import {
  COLLAPSED_EXPLORER_WIDTH,
  MAX_EXPLORER_WIDTH,
  MIN_EXPLORER_WIDTH,
} from "./preferences";
import {
  DesktopSidebarFooterNavigation,
  DesktopSidebarRailNavigation,
  type DesktopWorkspaceSurfaceAction,
  DesktopSidebarTopNavigation,
} from "./navigation";
import {
  DesktopViewerPackFallback,
  useDesktopViewerPackSurface,
} from "../viewer-packs";

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
    onConfigureCloudRemote: (remoteUrl: string, projectId?: string | null) => Promise<GitStatusSnapshot | null>;
    onOpenDetails: () => void;
    onOpenGitSettings: () => void;
    onSelectSection: (section: CloudWorkspaceSection) => void;
    onStartPuppyoneBackup: () => void;
  };
  dataPort: DataWorkspacePort | null;
  fileClipboardController: FileClipboardController;
  desktopUpdates: DesktopUpdatesController;
  git: DesktopGitController;
  onActiveDataPathChange: (path: string | null, node?: DataNode | null) => void;
  onActiveDataNodeChange: (node: DataNode | null) => void;
  onCreateEntryMenu: (parentPath: string | null, anchorRect: DesktopCreateEntryAnchorInput) => void;
  onFilesVisibilitySettingsChange: (settings: FilesVisibilitySettings) => void;
  onNavigate: (view: DesktopView) => void;
  onNodeActionMenu: (node: DataNode, anchorRect: DOMRect, selectedNodes?: readonly DataNode[]) => void;
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
  workspaceSurfaceError?: string | null;
  workspaceSurfaceAction?: DesktopWorkspaceSurfaceAction | null;
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
  fileClipboardController,
  desktopUpdates,
  git,
  onActiveDataPathChange,
  onActiveDataNodeChange,
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
  workspaceSurfaceError = null,
  workspaceSurfaceAction = null,
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
  const cloudAccessData = useDesktopCloudAccessData({
    projectId: cloud.projectId,
    cloudSession: cloud.cloudSession,
    apiBaseUrl: cloud.cloudApiBaseUrl,
    onCloudSessionChange: cloud.onCloudSessionChange,
  });
  const [activeCloudAccessRowId, setActiveCloudAccessRowId] = useState<string | null>(null);
  const [activeIntegrationProvider, setActiveIntegrationProvider] = useState<string | null>(null);
  const effectiveCloudAccessFilter: CloudAccessFilter = resolvedActiveView === "integrations"
    ? "integrations"
    : "all";

  useEffect(() => {
    const accessRows = cloudAccessData.accessRows.filter(isCloudAccessNavigationResource);
    if (activeCloudAccessRowId && accessRows.some((row) => row.id === activeCloudAccessRowId)) return;
    setActiveCloudAccessRowId(accessRows[0]?.id ?? null);
  }, [activeCloudAccessRowId, cloudAccessData.accessRows]);

  const handleIntegrationProviderChange = useCallback((provider: string | null) => {
    setActiveIntegrationProvider(provider);
  }, []);
  const handleOpenGitFile = useCallback((path: string) => {
    onActiveDataPathChange(path);
    onNavigate("data");
  }, [onActiveDataPathChange, onNavigate]);
  const renderPreviewBody = useCallback((node: DataNode, context: FilePreviewBodyContext) => {
    if (!isPuppyFlowFile(node.name, node.type)) return undefined;

    return (
      <PuppyFlowEditor
        node={node}
        fileContent={context.fileContent}
        workspacePath={workspace?.path ?? null}
        loading={context.loading}
        error={context.error}
        onSaveContent={context.onSaveContent}
      />
    );
  }, [workspace?.path]);

  const [viewerPackSnapshot, setViewerPackSnapshot] = useState<ViewerPackSnapshot>(EMPTY_VIEWER_PACK_SNAPSHOT);
  const refreshViewerPackSnapshot = useCallback(async () => {
    const bridge = window.puppyoneDesktop?.viewerPacks;
    if (!bridge?.getSnapshot) {
      setViewerPackSnapshot(EMPTY_VIEWER_PACK_SNAPSHOT);
      return;
    }
    try {
      const snapshot = await bridge.getSnapshot();
      setViewerPackSnapshot(snapshot ?? EMPTY_VIEWER_PACK_SNAPSHOT);
    } catch {
      setViewerPackSnapshot(EMPTY_VIEWER_PACK_SNAPSHOT);
    }
  }, []);

  useEffect(() => {
    if (cloudWorkspace) {
      setViewerPackSnapshot(EMPTY_VIEWER_PACK_SNAPSHOT);
      return;
    }
    void refreshViewerPackSnapshot();
  }, [cloudWorkspace, refreshViewerPackSnapshot, workspaceKey]);

  const externalViewerSurface = useDesktopViewerPackSurface({
    workspaceRoot: cloudWorkspace ? null : workspace.path,
    onInstalled: refreshViewerPackSnapshot,
  });
  const viewerPackInstallFallback = useCallback(
    ({ document }: { document: { path: string; name: string; mimeType?: string | null } }) => (
      <DesktopViewerPackFallback
        document={{
          path: document.path,
          name: document.name,
          type: "file",
          mimeType: document.mimeType ?? null,
          sourceKind: "local",
        }}
        onInstalled={refreshViewerPackSnapshot}
      />
    ),
    [refreshViewerPackSnapshot],
  );

  const settingsView = (
    <SettingsView
      workspace={workspace}
      activeSection={settingsSection}
      gitStatus={git.activeGitStatus}
      gitStatusLoading={git.gitStatusLoading}
      gitStatusError={git.gitStatusError}
      themeMode={preferences.themeMode}
      lightThemePreset={preferences.lightThemePreset}
      darkThemePreset={preferences.darkThemePreset}
      textSize={preferences.textSize}
      pointerCursors={preferences.pointerCursors}
      dockIcon={preferences.dockIcon}
      diffMarkers={preferences.diffMarkers}
      fileIconTheme={preferences.fileIconTheme}
      sidebarNavigationLayout={preferences.sidebarNavigationLayout}
      filesVisibilitySettings={preferences.filesVisibilitySettings}
      externalAppsSettings={preferences.externalAppsSettings}
      experimentalSettings={preferences.experimentalSettings}
      rightSidebarToolsSettings={preferences.rightSidebarToolsSettings}
      titlebarActionsSettings={preferences.titlebarActionsSettings}
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
      onLightThemePresetChange={preferences.setLightThemePreset}
      onDarkThemePresetChange={preferences.setDarkThemePreset}
      onTextSizeChange={preferences.setTextSize}
      onPointerCursorsChange={preferences.setPointerCursors}
      onDockIconChange={preferences.setDockIcon}
      onDiffMarkersChange={preferences.setDiffMarkers}
      onFileIconThemeChange={preferences.setFileIconTheme}
      onSidebarNavigationLayoutChange={preferences.setSidebarNavigationLayout}
      onFilesVisibilitySettingsChange={onFilesVisibilitySettingsChange}
      onExternalAppsSettingsChange={preferences.setExternalAppsSettings}
      onExperimentalSettingsChange={preferences.setExperimentalSettings}
      onRightSidebarToolsSettingsChange={preferences.setRightSidebarToolsSettings}
      onTitlebarActionsSettingsChange={preferences.setTitlebarActionsSettings}
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
      onOpenWorkingFile={handleOpenGitFile}
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
      accessData={cloudAccessData}
      activeFilter={effectiveCloudAccessFilter}
      activeAccessRowId={activeCloudAccessRowId}
      activeIntegrationProvider={resolvedActiveView === "integrations" ? activeIntegrationProvider : null}
      sessionRestoring={cloud.sessionRestoring}
      onCloudSessionChange={cloud.onCloudSessionChange}
      onRefresh={() => undefined}
      onSelectAccessRow={setActiveCloudAccessRowId}
    />
  );

  if (!dataPort) {
    if (cloudWorkspace && !cloud.cloudSession) return cloudAccessView;
    if (resolvedActiveView === "settings") return settingsView;
    if (resolvedActiveView === "git") return gitStatusView;
    if (resolvedActiveView === "cloud") return cloudMainView;
    if (resolvedActiveView === "access" || resolvedActiveView === "integrations") return cloudAccessView;
    return null;
  }

  return (
    <div className="desktop-data-workspace-wrap" data-sidebar-navigation-placement={preferences.sidebarNavigationPlacement}>
      {workspaceSurfaceError && (
        <div className="desktop-workspace-surface-alert" role="status">
          {workspaceSurfaceError}
        </div>
      )}
      {fileClipboardController.notice && (
        <div
          className="desktop-file-operation-notice"
          data-tone={fileClipboardController.notice.tone}
          role="status"
          aria-live="polite"
        >
          {fileClipboardController.notice.message}
        </div>
      )}
      <DataWorkspace
        key={workspaceKey}
        workspace={workspace}
        labels={{ root: workspace.name }}
        dataPort={dataPort}
        activePath={activeDataPath}
        onActivePathChange={onActiveDataPathChange}
        onActiveNodeChange={onActiveDataNodeChange}
        onOpenExternalUrl={openExternalUrl}
        viewerPackSnapshot={cloudWorkspace ? EMPTY_VIEWER_PACK_SNAPSHOT : viewerPackSnapshot}
        externalViewerSurface={cloudWorkspace ? null : externalViewerSurface}
        viewerPackInstallFallback={cloudWorkspace ? null : viewerPackInstallFallback}
        documentSourceKind={cloudWorkspace ? "cloud" : "local"}
        resizableExplorer
        explorerCollapsed={false}
        explorerWidth={preferences.explorerWidth}
        minExplorerWidth={MIN_EXPLORER_WIDTH}
        maxExplorerWidth={MAX_EXPLORER_WIDTH}
        collapsedExplorerWidth={COLLAPSED_EXPLORER_WIDTH}
        onExplorerWidthChange={preferences.setExplorerWidth}
        showHeader={false}
        showExplorerRoot={false}
        onExplorerRootContextMenu={(_state, event) => {
          event.preventDefault();
          event.stopPropagation();
          onCreateEntryMenu(null, getContextMenuAnchorRect(event));
        }}
        onExplorerNodeContextMenu={(state, node, event) => {
          event.preventDefault();
          event.stopPropagation();
          const anchorRect = getContextMenuAnchorRect(event);
          const selectedNodes = state.selectedNodes.some((selectedNode) => selectedNode.path === node.path)
            ? state.selectedNodes
            : [node];
          onNodeActionMenu(node, anchorRect, selectedNodes);
        }}
        explorerCutPaths={fileClipboardController.cutPaths}
        onCopyNodes={fileClipboardController.copyNodes}
        onCutNodes={fileClipboardController.cutNodes}
        onPasteNodes={fileClipboardController.pasteNodes}
        onDuplicateNodes={fileClipboardController.duplicateNodes}
        explorerListEndSlot={
          <button
            className="tree-row desktop-explorer-list-end-create-row"
            type="button"
            onClick={(event) => onCreateEntryMenu(
              null,
              rectToCreateEntryAnchor(event.currentTarget.getBoundingClientRect(), "auto-end"),
            )}
          >
            <span className="tree-row-content desktop-explorer-list-end-create-command">
              <span className="tree-icon-slot">
                <Plus size={14} strokeWidth={2.2} aria-hidden="true" />
              </span>
              <span className="tree-label">
                <span className="tree-label-primary">New</span>
              </span>
            </span>
          </button>
        }
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
        explorerRailSlot={preferences.sidebarNavigationPlacement === "left" ? (
          <DesktopSidebarRailNavigation
            activeView={resolvedActiveView}
            accessEnabled={accessNavigationEnabled}
            gitEnabled={gitEnabled}
            gitIncomingCount={git.gitIncomingCount}
            gitOperationLoading={git.gitOperationLoading}
            gitStatus={git.activeGitStatus}
            workspaceChangeCount={workspaceChangeCount}
            surfaceAction={workspaceSurfaceAction}
            onNavigate={onNavigate}
            onOpenSettings={onOpenSettings}
          />
        ) : undefined}
        showPreviewHeader={false}
        hidePreviewSourceView
        renderPreviewBody={renderPreviewBody}
        fileIconTheme={preferences.fileIconTheme}
        editorSaveMode="auto"
        htmlTrustMode="safe"
        aiEditRequest={activeAiEditRequest}
        enableMarkdownLinkContentIndexing={!cloudWorkspace}
        folderExpansionStrategy={cloudWorkspace ? "optimistic" : "load-before-expand"}
        refreshKey={workspaceRefreshToken}
        explorerNodeActionSlot={(state, node) => (
          <DesktopExplorerRowActions
            node={node}
            parentPath={node.type === "folder" ? node.path : null}
            onCreate={onCreateEntryMenu}
            onOpenNodeMenu={(targetNode, anchorRect) => {
              const selectedNodes = state.selectedNodes.some((selectedNode) => selectedNode.path === targetNode.path)
                ? state.selectedNodes
                : [targetNode];
              onNodeActionMenu(targetNode, anchorRect, selectedNodes);
            }}
          />
        )}
        explorerSlot={resolvedActiveView === "data" ? undefined : (
          <div className="desktop-view-surface desktop-view-surface-sidebar" data-view={resolvedActiveView}>
            {resolvedActiveView === "access" ? (
              <DesktopCloudAccessSidebar
                accessData={cloudAccessData}
                activeAccessRowId={activeCloudAccessRowId}
                onSelectAccessRow={setActiveCloudAccessRowId}
              />
            ) : resolvedActiveView === "integrations" ? (
              <DesktopCloudIntegrationsSidebar
                accessData={cloudAccessData}
                activeProvider={activeIntegrationProvider}
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
              surfaceAction={workspaceSurfaceAction}
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
          copy: Boolean(dataPort.copyNode),
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

function getContextMenuAnchorRect(event: ReactMouseEvent<HTMLElement>): DOMRect {
  if (event.clientX === 0 && event.clientY === 0) {
    return event.currentTarget.getBoundingClientRect();
  }
  return new DOMRect(event.clientX, event.clientY, 0, 0);
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
