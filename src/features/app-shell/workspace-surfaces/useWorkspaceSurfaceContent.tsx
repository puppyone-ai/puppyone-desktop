import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ComponentProps } from "react";
import type { ViewerPackSnapshot, Workspace } from "@puppyone/shared-ui";
import { useLocalization } from "@puppyone/localization";
import type { DesktopView } from "../../../components/DesktopCloudShell";
import type { useDesktopUpdates } from "../../../components/DesktopUpdateControls";
import type { DesktopCloudSession } from "../../../lib/cloudApi";
import type { FilesVisibilitySettings } from "../../../preferences";
import type { PuppyoneWorkspaceConfig, GitStatusSnapshot } from "../../../types/electron";
import {
  CloudProjectHistorySidebar,
  CloudProjectHistoryView,
  CloudServiceMainView,
  CloudServiceSidebar,
  DesktopCloudAccessSidebar,
  DesktopCloudAccessView,
  formatCloudMessage,
  isCloudAccessNavigationResource,
  resolveCloudProjectNavigationContext,
  shouldLoadDesktopCloudAccessData,
  useCloudHistoryController,
  useDesktopCloudAccessData,
  type CloudWorkspaceSection,
  type ProjectCloudContext,
} from "../../cloud";
import { createSourceControlWorkspaceSurface, getGitHostingMode, type DesktopGitController } from "../../source-control";
import { createSettingsWorkspaceSurface, type SettingsSection } from "../../settings";
import {
  DEFAULT_PLUGINS_SECTION,
  isPluginsNavigationVisible,
  PluginsSidebar,
  type PluginsSection,
} from "../../plugins";
import type { DesktopPreferencesController } from "../useDesktopPreferences";
import {
  getAvailableWorkspaceSurfaces,
  resolveWorkspaceSurface,
  resolveWorkspaceSurfaceContribution,
} from "./workspaceSurfaceRegistry";
import type {
  ResolvedWorkspaceSurface,
  WorkspaceSurfaceCapabilities,
  WorkspaceSurfaceAdapters,
  WorkspaceSurfaceId,
} from "./workspaceSurfaceTypes";

const LazyPluginsView = lazy(() => import("../../plugins/PluginsView").then((module) => ({
  default: module.PluginsView,
})));
const LazyDesktopCloudAutomationSidebar = lazy(() => import("../../automation").then((module) => ({
  default: module.DesktopCloudAutomationSidebar,
})));
const LazyDesktopCloudAutomationView = lazy(() => import("../../automation").then((module) => ({
  default: module.DesktopCloudAutomationView,
})));

type DesktopUpdatesController = ReturnType<typeof useDesktopUpdates>;

export type DesktopWorkspaceCloudSurfaceController = {
  activeSection: CloudWorkspaceSection;
  projectContext?: ProjectCloudContext | null;
  backupError: string | null;
  backupLoading: boolean;
  backupPending: boolean;
  cloudApiBaseUrl: string | null;
  cloudSession: DesktopCloudSession | null;
  storedCloudSession: DesktopCloudSession | null;
  enabled: boolean;
  projectId: string | null;
  sessionRestoring: boolean;
  onCloudSessionChange: (session: DesktopCloudSession | null) => void;
  onRemoveCloudRemote?: () => Promise<void>;
  onOpenDetails: () => void;
  onOpenGitSettings: () => void;
  onSelectSection: (section: CloudWorkspaceSection) => void;
  onStartPuppyoneBackup: () => void;
};

export type WorkspaceSurfaceContentResult = {
  availableSurfaceIds: readonly WorkspaceSurfaceId[];
  cloudHubNavigationEnabled: boolean;
  cloudToolsNavigationEnabled: boolean;
  cloudWorkspace: boolean;
  gitEnabled: boolean;
  pluginsNavigationVisible: boolean;
  resolvedActiveView: WorkspaceSurfaceId;
  resolvedSurface: ResolvedWorkspaceSurface;
  workspaceChangeCount: number;
};

export function useWorkspaceSurfaceContent({
  activeView,
  cloud,
  desktopUpdates,
  git,
  onActiveDataPathChange,
  onFilesVisibilitySettingsChange,
  onNavigate,
  onPuppyoneConfigChange,
  onSelectSettingsSection,
  onUnlinkWorkspace,
  preferences,
  puppyoneConfig,
  puppyoneConfigError,
  puppyoneConfigLoading,
  puppyoneConfigSaving,
  settingsSection,
  viewerPacks,
  viewerPluginsEnabled,
  workspace,
  workspaceKind,
  workspaceRefreshToken,
}: {
  activeView: DesktopView;
  cloud: DesktopWorkspaceCloudSurfaceController;
  desktopUpdates: DesktopUpdatesController;
  git: DesktopGitController;
  onActiveDataPathChange: (path: string | null) => void;
  onFilesVisibilitySettingsChange: (settings: FilesVisibilitySettings) => void;
  onNavigate: (view: DesktopView) => void;
  onPuppyoneConfigChange: (config: PuppyoneWorkspaceConfig) => Promise<PuppyoneWorkspaceConfig | null>;
  onSelectSettingsSection: (section: SettingsSection) => void;
  onUnlinkWorkspace: () => Promise<void>;
  preferences: DesktopPreferencesController;
  puppyoneConfig: PuppyoneWorkspaceConfig | null;
  puppyoneConfigError: string | null;
  puppyoneConfigLoading: boolean;
  puppyoneConfigSaving: boolean;
  settingsSection: SettingsSection;
  viewerPacks: {
    hostAvailable: boolean;
    refresh: () => Promise<void>;
    snapshot: ViewerPackSnapshot;
  };
  viewerPluginsEnabled: boolean;
  workspace: Workspace;
  workspaceKind: "local" | "cloud";
  workspaceRefreshToken: number;
}): WorkspaceSurfaceContentResult {
  const { t } = useLocalization();
  const cloudWorkspace = workspaceKind === "cloud";
  const pluginsNavigationVisible = isPluginsNavigationVisible({
    featureEnabled: viewerPluginsEnabled,
    visibility: preferences.sidebarNavigationVisibilitySettings,
  });
  const surfaceCapabilities = useMemo<WorkspaceSurfaceCapabilities>(() => ({
    workspaceKind,
    cloudEnabled: cloud.enabled,
    cloudProjectAvailable: Boolean(cloud.projectId),
    pluginsEnabled: pluginsNavigationVisible,
  }), [cloud.enabled, cloud.projectId, pluginsNavigationVisible, workspaceKind]);
  const resolvedActiveView = resolveWorkspaceSurfaceContribution(activeView, surfaceCapabilities).id;
  const availableSurfaceIds = useMemo(
    () => getAvailableWorkspaceSurfaces(surfaceCapabilities).map(({ id }) => id),
    [surfaceCapabilities],
  );
  const gitEnabled = !cloudWorkspace;
  const gitHostingMode = getGitHostingMode(git.activeGitStatus, puppyoneConfig);
  const workspaceChangeCount = gitEnabled
    ? getDesktopWorkspaceChangeCount(git.activeGitStatus, gitHostingMode === "github")
    : 0;
  const cloudHubNavigationEnabled = cloud.enabled && !cloudWorkspace;
  const cloudToolsNavigationEnabled = cloud.enabled && cloudWorkspace && Boolean(cloud.projectId);
  const projectContext = cloud.projectContext ?? { status: "local-only" as const, projectId: null };
  const cloudNavigationContext = resolveCloudProjectNavigationContext(projectContext);
  const needsCloudAccessData = shouldLoadDesktopCloudAccessData({
    workspaceKind,
    activeView: resolvedActiveView,
  });
  const cloudAccessData = useDesktopCloudAccessData({
    projectId: needsCloudAccessData ? cloud.projectId : null,
    cloudSession: cloud.cloudSession,
    apiBaseUrl: cloud.cloudApiBaseUrl,
    onCloudSessionChange: cloud.onCloudSessionChange,
  });
  const [activeCloudAccessRowId, setActiveCloudAccessRowId] = useState<string | null>(null);
  const [activeAutomationProvider, setActiveAutomationProvider] = useState<string | null>(null);
  const [activePluginsSection, setActivePluginsSection] = useState<PluginsSection>(DEFAULT_PLUGINS_SECTION);
  const cloudHistory = useCloudHistoryController({
    session: cloud.cloudSession,
    projectId: cloud.projectId,
    apiBaseUrl: cloud.cloudApiBaseUrl,
    enabled: cloudWorkspace && resolvedActiveView === "git",
    revisionKey: String(workspaceRefreshToken),
    onSessionChange: cloud.onCloudSessionChange,
  });
  const cloudHistoryError = cloudHistory.error ? formatCloudMessage(cloudHistory.error, t) : null;
  const cloudHistoryWarning = cloudHistory.warning ? formatCloudMessage(cloudHistory.warning, t) : null;

  useEffect(() => {
    const accessRows = cloudAccessData.accessRows.filter(isCloudAccessNavigationResource);
    if (activeCloudAccessRowId && accessRows.some(({ id }) => id === activeCloudAccessRowId)) return;
    setActiveCloudAccessRowId(accessRows[0]?.id ?? null);
  }, [activeCloudAccessRowId, cloudAccessData.accessRows]);

  const handleOpenGitFile = useCallback((path: string) => {
    onActiveDataPathChange(path);
    onNavigate("data");
  }, [onActiveDataPathChange, onNavigate]);
  const sourceControlSurface = createSourceControlWorkspaceSurface({
    controller: git,
    workspace,
    puppyoneConfig,
    gitDisplayMode: preferences.gitDisplayMode,
    fileIconTheme: preferences.fileIconTheme,
    cloudBackup: {
      loading: cloud.backupLoading || cloud.backupPending,
      error: cloud.backupError,
      enabled: cloud.enabled,
      start: cloud.onStartPuppyoneBackup,
    },
    onOpenFile: handleOpenGitFile,
  });
  const settingsSurface = createSettingsWorkspaceSurface({
    workspace,
    activeSection: settingsSection,
    onSelectSection: onSelectSettingsSection,
    preferences,
    onFilesVisibilitySettingsChange,
    git: {
      status: git.activeGitStatus,
      loading: git.gitStatusLoading,
      error: git.gitStatusError,
      refresh: git.refreshGitStatus,
    },
    cloud: {
      enabled: cloud.enabled,
      session: cloud.storedCloudSession,
      sessionRestoring: cloud.sessionRestoring,
      apiBaseUrl: cloud.cloudApiBaseUrl,
      onSessionChange: cloud.onCloudSessionChange,
    },
    workspaceConfig: {
      value: puppyoneConfig,
      loading: puppyoneConfigLoading,
      saving: puppyoneConfigSaving,
      error: puppyoneConfigError,
      change: onPuppyoneConfigChange,
      unlink: onUnlinkWorkspace,
    },
    updates: {
      state: desktopUpdates.state,
      check: desktopUpdates.checkForUpdates,
      install: desktopUpdates.updateNow,
    },
  });
  const cloudHistorySurface = {
    sidebar: (
      <CloudProjectHistorySidebar
        rows={cloudHistory.rows}
        selectedCommitId={cloudHistory.selectedCommitId}
        loading={cloudHistory.loading}
        loadingMore={cloudHistory.loadingMore}
        hasMore={cloudHistory.hasMore}
        error={cloudHistoryError}
        warning={cloudHistoryWarning}
        onSelectCommit={cloudHistory.selectCommit}
        onRefresh={cloudHistory.reload}
        onLoadMore={cloudHistory.loadMore}
      />
    ),
    main: (
      <CloudProjectHistoryView
        projectId={cloud.projectId}
        projectName={workspace.name}
        history={cloudHistory.history}
        rows={cloudHistory.rows}
        selectedCommitId={cloudHistory.selectedCommitId}
        loading={cloudHistory.loading}
        loadingMore={cloudHistory.loadingMore}
        hasMore={cloudHistory.hasMore}
        error={cloudHistoryError}
        warning={cloudHistoryWarning}
        onSelectCommit={cloudHistory.selectCommit}
        onRefresh={cloudHistory.reload}
        onLoadMore={cloudHistory.loadMore}
      />
    ),
  };
  const cloudAccessSurface = {
    sidebar: (
      <DesktopCloudAccessSidebar
        accessData={cloudAccessData}
        activeAccessRowId={activeCloudAccessRowId}
        onSelectAccessRow={setActiveCloudAccessRowId}
      />
    ),
    main: (
      <DesktopCloudAccessView
        projectId={cloud.projectId}
        cloudSession={cloud.cloudSession}
        accessData={cloudAccessData}
        activeFilter="all"
        activeAccessRowId={activeCloudAccessRowId}
        sessionRestoring={cloud.sessionRestoring}
        onCloudSessionChange={cloud.onCloudSessionChange}
        onRefresh={() => undefined}
        onSelectAccessRow={setActiveCloudAccessRowId}
      />
    ),
  };
  const automationSurface = {
    sidebar: (
      <Suspense fallback={<DesktopRouteLoading label={t("workspace.loadingAutomation")} />}>
        <LazyDesktopCloudAutomationSidebar
          accessData={cloudAccessData}
          activeProvider={activeAutomationProvider}
          onSelectProvider={setActiveAutomationProvider}
        />
      </Suspense>
    ),
    main: (
      <Suspense fallback={<DesktopRouteLoading label={t("workspace.loadingAutomation")} />}>
        <LazyDesktopCloudAutomationView
          projectId={cloud.projectId}
          cloudSession={cloud.cloudSession}
          accessData={cloudAccessData}
          activeProvider={activeAutomationProvider}
          sessionRestoring={cloud.sessionRestoring}
          onCloudSessionChange={cloud.onCloudSessionChange}
          onRefresh={() => undefined}
        />
      </Suspense>
    ),
  };
  const pluginsSurface = {
    sidebar: (
      <PluginsSidebar
        activeSection={activePluginsSection}
        installedCount={viewerPacks.snapshot.contributions.length}
        onSelectSection={setActivePluginsSection}
      />
    ),
    main: (
      <Suspense fallback={<div className="desktop-plugins-loading">{t("workspace.loadingPlugins")}</div>}>
        <LazyPluginsView
          activeSection={activePluginsSection}
          hostAvailable={viewerPacks.hostAvailable}
          snapshot={viewerPacks.snapshot}
          onRefresh={viewerPacks.refresh}
          onSelectSection={setActivePluginsSection}
        />
      </Suspense>
    ),
  };
  const cloudServiceSurface = {
    sidebar: (
      <CloudServiceSidebar
        status={git.activeGitStatus}
        cloudSession={cloud.storedCloudSession}
        cloudApiBaseUrl={cloud.cloudApiBaseUrl}
        activeSection={cloud.activeSection}
        projectContext={cloudNavigationContext.projectContext}
        localWorkspaceContext={cloudNavigationContext.localWorkspaceContext && !cloudWorkspace}
        projectCapabilities={projectContext.status === "resolved"
          ? projectContext.capabilities ?? []
          : []}
        onSelectSection={cloud.onSelectSection}
      />
    ),
    main: (
      <CloudServiceMainView
        workspace={workspace}
        status={git.activeGitStatus}
        cloudApiBaseUrl={cloud.cloudApiBaseUrl}
        cloudSession={cloud.storedCloudSession}
        sessionRestoring={cloud.sessionRestoring}
        projectContext={cloudWorkspace ? null : projectContext}
        onCloudSessionChange={cloud.onCloudSessionChange}
        activeSection={cloud.activeSection}
        loading={git.gitStatusLoading}
        error={git.gitStatusError}
        cloudBackupLoading={cloud.backupLoading}
        cloudBackupPending={cloud.backupPending}
        cloudBackupError={cloud.backupError}
        onStartPuppyoneBackup={cloud.onStartPuppyoneBackup}
        onRemoveCloudRemote={cloud.onRemoveCloudRemote}
        onSelectSection={cloud.onSelectSection}
        onRefresh={git.refreshGitStatus}
        onOpenDetails={cloud.onOpenDetails}
        onOpenGitSettings={cloud.onOpenGitSettings}
      />
    ),
  };
  const adapters: WorkspaceSurfaceAdapters = {
    data: () => ({ sidebar: null, main: cloudWorkspace && !cloud.cloudSession ? cloudAccessSurface.main : null }),
    git: () => cloudWorkspace ? cloudHistorySurface : sourceControlSurface,
    plugins: () => pluginsSurface,
    cloud: () => cloudServiceSurface,
    access: () => cloudAccessSurface,
    automation: () => automationSurface,
    settings: () => settingsSurface,
  };
  return {
    availableSurfaceIds,
    cloudHubNavigationEnabled,
    cloudToolsNavigationEnabled,
    cloudWorkspace,
    gitEnabled,
    pluginsNavigationVisible,
    resolvedActiveView,
    resolvedSurface: resolveWorkspaceSurface({ capabilities: surfaceCapabilities, adapters, requestedId: activeView }),
    workspaceChangeCount,
  };
}

function DesktopRouteLoading({ label }: { label: string }) {
  return <div className="desktop-view-route-loading" role="status" aria-live="polite">{label}</div>;
}

function getDesktopWorkspaceChangeCount(
  status: GitStatusSnapshot | null,
  includeCommittedChanges: boolean,
) {
  if (!status?.isRepo) return 0;
  const localChangeCount = status.stagedEntries.length
    + status.unstagedEntries.length
    + status.untrackedEntries.length;
  return localChangeCount + (includeCommittedChanges ? Math.max(0, status.sourceControl.remote.ahead) : 0);
}
