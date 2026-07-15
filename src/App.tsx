import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  flushActiveDocumentSessions,
  type DataNode,
  type DataWorkspaceActivePathChangeContext,
} from "@puppyone/shared-ui";
import { useLocalization } from "@puppyone/localization";
import { DesktopCloudShell, type DesktopView } from "./components/DesktopCloudShell";
import type { SettingsSection } from "./features/settings";
import {
  CloudServicePanel,
  type CloudWorkspaceSection,
} from "./features/cloud";
import {
  MinimalOnboarding,
  type OnboardingOperationStatus,
} from "./components/MinimalOnboarding";
import { AssetLibraryHome } from "./components/AssetLibraryHome";
import { isDesktopAgentChatEnabled, loadRightAgentPanel } from "./features/desktop-agent/lazy";
import {
  isDesktopTerminalEnabled,
  RightTerminalPanel,
  type RightTerminalPanelHandle,
} from "./features/desktop-terminal";
import { useDesktopUpdates } from "./components/DesktopUpdateControls";
import {
  configureWorkspaceCloudRemote,
  createLocalDataPort,
  getWorkspaceGitStatus,
  readPuppyoneWorkspaceConfig,
  removeWorkspaceGitRemote,
  showHomepage,
} from "./lib/localFiles";
import { openWorkspaceTarget } from "./lib/workspaceOpening";
import {
  getDesktopCloudApiBaseUrl,
  getCloudProject,
  isCloudSessionForApiBase,
  revokeCloudGitCredential,
  type DesktopCloudProject,
  type DesktopCloudSession,
} from "./lib/cloudApi";
import {
  createCloudDataPort,
  createCloudWorkspace,
  getCloudProjectIdFromWorkspace,
  isCloudWorkspace,
} from "./lib/cloudDataPort";
import { startDesktopCloudOAuth } from "./lib/cloudSession";
import {
  type FilesVisibilitySettings,
} from "./preferences";
import type { PuppyoneWorkspaceConfig } from "./types/electron";
import {
  getWorkspaceSwitcherItems,
} from "./features/app-shell/workspaceHomeModel";
import {
  MAX_RIGHT_SIDEBAR_WIDTH,
  MIN_RIGHT_SIDEBAR_WIDTH,
  mergePuppyoneWorkspaceConfig,
} from "./features/app-shell/preferences";
import { DesktopTitlebarContext } from "./features/app-shell/DesktopTitlebarContext";
import { DesktopWorkspaceContent } from "./features/app-shell/DesktopWorkspaceContent";
import { DesktopTitlebarActions } from "./features/app-shell/DesktopTitlebarActions";
import { DesktopOverlayPortal } from "./features/app-shell/DesktopOverlayPortal";
import type { DesktopWorkspaceSwitcherItem } from "./features/app-shell/DesktopWorkspaceSwitcher";
import { RestoringWorkspaceScreen } from "./features/app-shell/RestoringWorkspaceScreen";
import { useDesktopPreferences } from "./features/app-shell/useDesktopPreferences";
import { isAssetLibraryHomeEnabled } from "./features/app-shell/homeFeatureGate";
import { useWorkspaceLifecycle } from "./features/app-shell/useWorkspaceLifecycle";
import { usePuppyoneConfig } from "./features/app-shell/usePuppyoneConfig";
import { useActiveExternalOpenTarget } from "./features/external-apps/useActiveExternalOpenTarget";
import { useDesktopCloudSession } from "./features/cloud/hooks/useDesktopCloudSession";
import { useCloudProjectHome } from "./features/cloud/hooks/useCloudProjectHome";
import {
  getResolvedCloudProjectId,
  resolveCloudHubSectionAfterContextChange,
  useProjectCloudContext,
} from "./features/cloud/context";
import { useFeatureFlag } from "./features/flags";
import {
  DesktopCreateEntryDialog,
  DesktopCreateEntryMenu,
  DesktopNodeActionMenu,
} from "./features/data-workspace/nodeActions";
import { createExplorerDataPort } from "./features/data-workspace/explorer";
import { useDataNodeActions } from "./features/data-workspace/useDataNodeActions";
import { useAiEditReviewRequest } from "./features/data-workspace/useAiEditReviewRequest";
import {
  BranchSwitchConflictDialog,
  GitOperationErrorDialog,
} from "./features/source-control/operationDialogs";
import { useDesktopGitController } from "./features/source-control/useDesktopGitController";
import { createRepositoryRefreshReason } from "./features/source-control/repositoryRefreshPolicy";
import { CloudProjectResolveDialog } from "./features/cloud/workspace/CloudProjectResolveDialog";
import { useWorkspaceSurfaceSwitch } from "./features/cloud/workspace/useWorkspaceSurfaceSwitch";
import { useCloudWorkspaceContext } from "./features/cloud/workspace/useCloudWorkspaceContext";
import { shouldBlockWorkspaceCloudResolution } from "./features/cloud/workspace/workspaceCloudResolutionKey";
import { usePuppyoneCloudBackup } from "./features/cloud/workspace/usePuppyoneCloudBackup";
import { shouldLoadCloudProjectCatalog } from "./features/cloud/workspace/cloudProjectResolution";
import { issueWorkspaceGitRemote } from "./features/cloud/workspace/workspaceGitRemote";
import type { CloudGitRemoteOptions } from "./features/cloud/types";
import { formatCloudMessage } from "./features/cloud/cloudPresentation";
import {
  createTypographyRootProps,
  useTypographyCatalog,
  useTypographyRuntime,
} from "./features/typography";

const CLOUD_BROWSER_SIGN_IN_COOLDOWN_MS = 1500;
const DesktopMinimalModeDock = lazy(() => import("./features/app-shell/DesktopMinimalModeDock").then((module) => ({
  default: module.DesktopMinimalModeDock,
})));
const RightAgentPanel = lazy(loadRightAgentPanel);

export function App() {
  const { t } = useLocalization();
  const desktopUpdates = useDesktopUpdates();
  const [activeView, setActiveView] = useState<DesktopView>("data");
  const preferences = useDesktopPreferences();
  const fontCatalog = useTypographyCatalog();
  const typography = useTypographyRuntime(preferences.typographyPreferences, fontCatalog);
  const typographyRootProps = useMemo(() => createTypographyRootProps(typography), [typography]);
  const cloudEnabled = useFeatureFlag("cloudWorkspace");
  const cloudOnlyWorkspaceEnabled = useFeatureFlag("cloudOnlyWorkspace");
  const assetLibraryHomeAvailable = useFeatureFlag("assetLibraryHome");
  const agentChatAvailable = useFeatureFlag("desktopAgentChat");
  const cloudOnlyEntryEnabled = cloudEnabled && cloudOnlyWorkspaceEnabled;
  const {
    cloudAuthStatus,
    cloudSession,
    cloudSessionRestoring,
    handleCloudSessionChange: updateCloudSession,
  } = useDesktopCloudSession(cloudEnabled);
  const [activeCloudSection, setActiveCloudSection] = useState<CloudWorkspaceSection>("overview");
  const [cloudPanelOpen, setCloudPanelOpen] = useState(false);
  const [homeOperationStatus, setHomeOperationStatus] = useState<OnboardingOperationStatus | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const showBrowserSignInStatus = useCallback((detail: string) => {
    setHomeOperationStatus({
      title: "Opening browser sign-in",
      detail,
    });
  }, []);
  useEffect(() => {
    if (cloudAuthStatus === "signing-in") return;
    setHomeOperationStatus((current) => (
      current?.title === "Opening browser sign-in" ? null : current
    ));
  }, [cloudAuthStatus]);
  const {
    activateWorkspace,
    clearWorkspace,
    forgetActiveWorkspace,
    handleWorkspaceOpenResult,
    openFolder,
    openWorkspacePath,
    recentWorkspaceItems,
    refreshRecentWorkspaceList,
    restoreWorkspaceError,
    restoringWorkspace,
    setRestoreWorkspaceError,
    setWorkspaces,
    workspace,
    workspaces,
  } = useWorkspaceLifecycle({
    onWorkspaceActivated: useCallback(() => {
      setActiveView("data");
      setSwitcherOpen(false);
      setHomeOperationStatus(null);
    }, []),
    onWorkspaceCleared: useCallback(() => {
      setActiveView("data");
      setSwitcherOpen(false);
    }, []),
    onWorkspaceOpenSettled: useCallback(() => {
      setSwitcherOpen(false);
    }, []),
  });
  const {
    aiEditAssistEnabled,
    explorerWidth,
    experimentalSettings,
    externalAppsSettings,
    fileIconTheme,
    filesVisibilitySettings,
    resolvedTheme,
    rightSidebarOpen,
    rightSidebarToolsSettings,
    rightSidebarWidth,
    rightSidebarSurface,
    agentPreferredRuntime,
    agentPreferredModel,
    sidebarCollapsed,
    sidebarNavigationLayout,
    sidebarNavigationOrientation,
    sidebarNavigationPlacement,
    terminalToolEnabled,
    titlebarActionsSettings,
    darkThemePreset,
    diffMarkers,
    lightThemePreset,
    pointerCursors,
    textSize,
    themeMode,
    setAiEditAssistEnabled,
    setExplorerWidth,
    setExternalAppsSettings,
    setFileIconTheme,
    setFilesVisibilitySettings,
    setRightSidebarOpen,
    setRightSidebarToolsSettings,
    setRightSidebarWidth,
    setRightSidebarSurface,
    setAgentPreferredRuntime,
    setAgentPreferredModel,
    setSidebarCollapsed,
    setSidebarNavigationLayout,
    setThemeMode,
  } = preferences;
  const minimalMode = experimentalSettings.enableMinimalMode;
  const assetLibraryHomeEnabled = isAssetLibraryHomeEnabled({
    available: assetLibraryHomeAvailable,
    optedIn: experimentalSettings.enableAssetLibraryHome,
  });
  const Homepage = assetLibraryHomeEnabled ? AssetLibraryHome : MinimalOnboarding;
  const [activeSettingsSection, setActiveSettingsSection] = useState<SettingsSection>("account");
  const [workspaceRefreshToken, setWorkspaceRefreshToken] = useState(0);
  const [activeDataPath, setActiveDataPath] = useState<string | null>(null);
  const [activeDataNode, setActiveDataNode] = useState<DataNode | null>(null);
  const [documentNavigationError, setDocumentNavigationError] = useState<string | null>(null);
  const documentNavigationRequestRef = useRef(0);
  const desktopViewNavigationRequestRef = useRef(0);
  const drainWorkspaceNavigation = useCallback(async (): Promise<boolean> => {
    try {
      await flushActiveDocumentSessions("workspace-switch");
      setDocumentNavigationError(null);
      return true;
    } catch (error) {
      setDocumentNavigationError(error instanceof Error ? error.message : String(error));
      return false;
    }
  }, []);
  const switcherRef = useRef<HTMLDivElement>(null);
  const terminalPanelRef = useRef<RightTerminalPanelHandle>(null);
  const cloudBrowserSignInInFlightRef = useRef(false);
  const workspaceIsCloud = isCloudWorkspace(workspace);
  const desktopTerminalEnabled = isDesktopTerminalEnabled({ terminalToolEnabled, workspaceIsCloud });
  const desktopAgentChatEnabled = isDesktopAgentChatEnabled({
    available: agentChatAvailable,
    optedIn: experimentalSettings.enableAgentChat,
    workspaceIsCloud,
  });
  const desktopRightSidebarEnabled = desktopTerminalEnabled || desktopAgentChatEnabled;

  useEffect(() => {
    if (!desktopRightSidebarEnabled) {
      if (rightSidebarOpen) setRightSidebarOpen(false);
      return;
    }
    if (rightSidebarSurface === "terminal" && !desktopTerminalEnabled) {
      setRightSidebarSurface("chat");
      return;
    }
    if (rightSidebarSurface === "chat" && !desktopAgentChatEnabled) {
      setRightSidebarSurface("terminal");
    }
  }, [
    desktopAgentChatEnabled,
    desktopRightSidebarEnabled,
    desktopTerminalEnabled,
    rightSidebarOpen,
    rightSidebarSurface,
    setRightSidebarOpen,
    setRightSidebarSurface,
  ]);
  const cloudOnlyProjectId = getCloudProjectIdFromWorkspace(workspace);
  useEffect(() => {
    if (workspace && homeOperationStatus) setHomeOperationStatus(null);
  }, [homeOperationStatus, workspace]);
  const startCloudBrowserSignIn = useCallback(async () => {
    if (!cloudEnabled) return;
    if (cloudAuthStatus === "signing-in") {
      showBrowserSignInStatus("A secure Puppyone Cloud sign-in is already open in your browser.");
      return;
    }
    if (cloudBrowserSignInInFlightRef.current) return;
    cloudBrowserSignInInFlightRef.current = true;
    try {
      await startDesktopCloudOAuth(getDesktopCloudApiBaseUrl());
    } catch (error) {
      setHomeOperationStatus(null);
      setRestoreWorkspaceError(error instanceof Error ? error.message : String(error));
    } finally {
      window.setTimeout(() => {
        cloudBrowserSignInInFlightRef.current = false;
      }, CLOUD_BROWSER_SIGN_IN_COOLDOWN_MS);
    }
  }, [cloudAuthStatus, cloudEnabled, setRestoreWorkspaceError, showBrowserSignInStatus]);
  const handleCloudDataSessionChange = useCallback((session: DesktopCloudSession | null) => {
    updateCloudSession(session);
    if (!session) {
      setActiveView("data");
    }
  }, [updateCloudSession]);
  const refreshWorkspaceContent = useCallback(() => {
    setWorkspaceRefreshToken((token) => token + 1);
  }, []);
  const git = useDesktopGitController({
    workspace: workspaceIsCloud ? null : workspace,
    gitViewActive: !workspaceIsCloud && activeView === "git",
    onWorkspaceContentChanged: refreshWorkspaceContent,
    onEnterGitView: () => setActiveView("git"),
  });
  const {
    activeGitStatus,
    branchSwitcherOpen,
    branchSwitcherRef,
    gitCommitDetail,
    gitCommitDetailError,
    gitCommitDetailLoading,
    gitIncomingCount,
    gitMainPanel,
    gitOperationError,
    gitOperationLoading,
    gitStatusError,
    gitStatusLoading,
    gitStatusPath,
    gitWorkingFileDiff,
    gitWorkingFileDiffError,
    gitWorkingFileDiffLoading,
    localBranches,
    pendingBranchSwitch,
    remoteBranches,
    selectedGitCommitId,
    selectedGitWorkingFile,
    applyGitStatus,
    captureGitRepositoryContext,
    clearGitSelection,
    dismissGitOperationError,
    handleCheckoutGitBranch,
    handleCommitAndCheckoutBranch,
    handleCommitAndPushGit,
    handleCommitGit,
    handleDiscardAllGitChanges,
    handleDiscardGitPaths,
    handleInitializeGitRepository,
    handlePublishGitBranch,
    handlePullGit,
    handlePushGit,
    handleStageAllGitChanges,
    handleStageAndCommitGit,
    handleStageGitPaths,
    handleStashAndCheckoutBranch,
    handleUnstageGitPaths,
    isGitRepositoryContextCurrent,
    refreshGitStatus,
    refreshGitStatusWithFetch,
    selectGitCommit,
    selectGitMainPanel,
    selectGitWorkingFile,
    setBranchSwitcherOpen,
    setGitOperationError,
    setGitOperationLoading,
    setPendingBranchSwitch,
  } = git;
  const {
    puppyoneConfig,
    puppyoneConfigError,
    puppyoneConfigLoading,
    puppyoneConfigSaving,
    handlePuppyoneConfigChange: savePuppyoneConfig,
  } = usePuppyoneConfig(workspace && !workspaceIsCloud ? workspace.path : null);
  const workspaceKey = useMemo(() => workspace?.path ?? "no-workspace", [workspace?.path]);
  const desktopCloudApiBaseUrl = useMemo(() => getDesktopCloudApiBaseUrl(), []);
  const activeCloudSession = useMemo(
    () => isCloudSessionForApiBase(cloudSession, desktopCloudApiBaseUrl) ? cloudSession : null,
    [cloudSession, desktopCloudApiBaseUrl],
  );
  const activeCloudAccountEmail = activeCloudSession?.user_email ?? null;
  const storedCloudAccountEmail = cloudSession?.user_email ?? activeCloudAccountEmail;
  const localDataPort = useMemo(
    () => (workspace && !workspaceIsCloud ? createLocalDataPort(workspace.path) : null),
    [workspace, workspaceIsCloud],
  );
  const cloudDataPort = useMemo(
    () => (
      workspaceIsCloud && cloudOnlyProjectId && activeCloudSession
        ? createCloudDataPort({
            projectId: cloudOnlyProjectId,
            session: activeCloudSession,
            onSessionChange: handleCloudDataSessionChange,
          })
        : null
    ),
    [activeCloudSession, cloudOnlyProjectId, handleCloudDataSessionChange, workspaceIsCloud],
  );
  const dataPort = useMemo(
    () => {
      const baseDataPort = workspaceIsCloud ? cloudDataPort : localDataPort;
      return baseDataPort ? createExplorerDataPort(baseDataPort, filesVisibilitySettings) : null;
    },
    [cloudDataPort, filesVisibilitySettings, localDataPort, workspaceIsCloud],
  );
  const latestAiEditRequest = useAiEditReviewRequest({
    aiEditAssistEnabled,
    onWorkspaceContentChanged: refreshWorkspaceContent,
    workspace,
    workspaceIsCloud,
  });
  const activeAiEditRequest = aiEditAssistEnabled ? latestAiEditRequest : null;
  const cloudWorkspaceAvailable = useMemo(() => Boolean(activeCloudSession), [activeCloudSession]);
  const enterDataView = useCallback(() => {
    setActiveView("data");
    setSidebarCollapsed(false);
    setSwitcherOpen(false);
    setBranchSwitcherOpen(false);
  }, [setBranchSwitcherOpen, setSidebarCollapsed]);
  const {
    createEntryDraft,
    nodeActionMenu,
    fileClipboardController,
    resetDataNodeActions,
    setCreateEntryDraft,
    setNodeActionMenu,
    openCreateEntryMenu,
    openNodeActionMenu,
    selectCreateEntryKind,
    createEntryFromMenu,
    renameNodeFromMenu,
    deleteNodeFromMenu,
    revealNodeInFinderFromMenu,
    openNodeInDefaultAppFromMenu,
  } = useDataNodeActions({
    dataPort,
    externalAppsSettings,
    onEnterDataView: enterDataView,
    onLocalWorkspaceContentChanged: refreshGitStatus,
    onWorkspaceContentChanged: refreshWorkspaceContent,
    setActiveDataNode,
    setActiveDataPath,
    workspace,
    workspaceIsCloud,
  });

  useEffect(() => {
    if (
      (!cloudEnabled && (activeView === "cloud" || activeView === "access" || activeView === "automation")) ||
      (!workspaceIsCloud && (activeView === "access" || activeView === "automation")) ||
      (activeView === "plugins" && (workspaceIsCloud || !experimentalSettings.enableViewerPlugins))
    ) {
      setActiveView("data");
      setActiveCloudSection("overview");
    }
  }, [activeView, cloudEnabled, experimentalSettings.enableViewerPlugins, workspaceIsCloud]);

  useEffect(() => {
    const preventFileDropNavigation = (event: DragEvent) => {
      event.preventDefault();
    };

    window.addEventListener("dragover", preventFileDropNavigation);
    window.addEventListener("drop", preventFileDropNavigation);
    return () => {
      window.removeEventListener("dragover", preventFileDropNavigation);
      window.removeEventListener("drop", preventFileDropNavigation);
    };
  }, []);

  useEffect(() => {
    if (!switcherOpen && !branchSwitcherOpen) return undefined;

    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && switcherRef.current?.contains(target)) return;
      if (target instanceof Node && branchSwitcherRef.current?.contains(target)) return;
      setSwitcherOpen(false);
      setBranchSwitcherOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSwitcherOpen(false);
        setBranchSwitcherOpen(false);
      }
    };

    window.addEventListener("pointerdown", closeOnPointerDown, true);
    window.addEventListener("keydown", closeOnEscape, true);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointerDown, true);
      window.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [branchSwitcherOpen, branchSwitcherRef, setBranchSwitcherOpen, switcherOpen]);

  useEffect(() => {
    setGitOperationError(null);
    setGitOperationLoading(null);
    setActiveSettingsSection("workspace");
    setBranchSwitcherOpen(false);
    setActiveDataPath(null);
    setActiveDataNode(null);
    resetDataNodeActions();
  }, [resetDataNodeActions, setBranchSwitcherOpen, setGitOperationError, setGitOperationLoading, workspace?.path]);

  const openWorkspaceSwitcherItem = useCallback((item: DesktopWorkspaceSwitcherItem) => {
    if (item.id === workspace?.id) {
      setSwitcherOpen(false);
      return;
    }

    void (async () => {
      if (!await drainWorkspaceNavigation()) return;

      if (item.kind === "cloud") {
        const projectId = getCloudProjectIdFromWorkspace(item.workspace);
        if (!projectId) {
          activateWorkspace(item.workspace);
          return;
        }

        await openWorkspaceTarget({
          kind: "cloud-project",
          projectId,
          name: item.workspace.name,
        }).then(handleWorkspaceOpenResult);
        return;
      }

      await openWorkspaceTarget({
        kind: "local",
        path: item.workspace.path,
      }).then(handleWorkspaceOpenResult);
    })().catch((error) => {
      setRestoreWorkspaceError(error instanceof Error ? error.message : String(error));
    });
  }, [
    activateWorkspace,
    drainWorkspaceNavigation,
    handleWorkspaceOpenResult,
    setRestoreWorkspaceError,
    workspace?.id,
  ]);

  const openOrActivateCloudWorkspace = useCallback(async (project: DesktopCloudProject) => {
    if (workspace) {
      if (!await drainWorkspaceNavigation()) return;
      const result = await openWorkspaceTarget({
        kind: "cloud-project",
        projectId: project.id,
        name: project.name || "Untitled Project",
      });
      handleWorkspaceOpenResult(result);
      return;
    }

    activateWorkspace(createCloudWorkspace(project));
  }, [activateWorkspace, drainWorkspaceNavigation, handleWorkspaceOpenResult, workspace]);

  const autoRefreshProjectCatalog = shouldLoadCloudProjectCatalog({
    hasOpenWorkspace: Boolean(workspace),
    workspaceIsCloud,
    workspaceRestoring: restoringWorkspace,
  });

  const {
    createCloudProjectFromHomepage,
    homeCloudProjects,
    homeCloudProjectsError,
    homeCloudProjectsLoading,
    homeProjectItems,
    openCloudProjectFromHomepage,
    pendingCloudProjectCreate,
    recentWorkspaceCloudContexts,
    refreshHomeCloudProjects,
    setHomeCloudProjects,
    setHomeCloudProjectsError,
    setPendingCloudProjectCreate,
    setRecentWorkspaceCloudContexts,
  } = useCloudProjectHome({
    activeCloudSession,
    autoRefreshProjectCatalog,
    autoResolveRecentWorkspaceContexts: autoRefreshProjectCatalog,
    cloudEnabled,
    desktopCloudApiBaseUrl,
    includeUnboundCloudProjects: cloudOnlyWorkspaceEnabled,
    onOpenCloudProject: openOrActivateCloudWorkspace,
    onPendingCloudProjectCreateReady: useCallback(() => {
      setCloudPanelOpen(false);
    }, []),
    recentWorkspaceItems,
    setHomeOperationStatus,
    setRestoreWorkspaceError,
    showBrowserSignInStatus,
    startCloudBrowserSignIn,
    updateCloudSession,
  });

  const cloudResolutionInputsLoading = shouldBlockWorkspaceCloudResolution({
    gitStatusError,
    gitStatusPath,
    workspacePath: workspace?.path ?? null,
  });

  const projectCloudContext = useProjectCloudContext({
    workspace,
    workspaceIsCloud,
    recentWorkspaceCloudContexts,
    activeGitStatus,
    activeCloudSession,
    desktopCloudApiBaseUrl,
    resolutionInputsLoading: cloudResolutionInputsLoading,
  });
  const resolvedCloudProjectId = getResolvedCloudProjectId(projectCloudContext);
  const effectiveCloudProjectId = workspaceIsCloud ? cloudOnlyProjectId : resolvedCloudProjectId;

  const workspacePath = workspace?.path ?? null;
  const cloudHubWorkspaceIdentity = workspace
    ? `${workspaceIsCloud ? "cloud" : "local"}:${workspace.id}:${workspace.path}`
    : null;
  const previousCloudHubWorkspaceIdentityRef = useRef<string | null>(null);
  useEffect(() => {
    const workspaceChanged = previousCloudHubWorkspaceIdentityRef.current !== cloudHubWorkspaceIdentity;
    previousCloudHubWorkspaceIdentityRef.current = cloudHubWorkspaceIdentity;
    if (!workspacePath || workspaceIsCloud) return;
    setActiveCloudSection((currentSection) => resolveCloudHubSectionAfterContextChange({
      currentSection,
      hasProjectContext: Boolean(resolvedCloudProjectId),
      workspaceChanged,
    }));
  }, [resolvedCloudProjectId, cloudHubWorkspaceIdentity, workspaceIsCloud, workspacePath]);

  const goToHomepage = useCallback(async () => {
    try {
      if (!await drainWorkspaceNavigation()) return;
      await showHomepage();
      clearWorkspace();
      setSwitcherOpen(false);
      setBranchSwitcherOpen(false);
      setRightSidebarOpen(false);
      resetDataNodeActions();
      setRestoreWorkspaceError(null);
      setHomeOperationStatus(null);
      await Promise.all([
        refreshRecentWorkspaceList(),
        refreshHomeCloudProjects(),
      ]);
    } catch (error) {
      setRestoreWorkspaceError(error instanceof Error ? error.message : String(error));
    }
  }, [
    clearWorkspace,
    drainWorkspaceNavigation,
    refreshHomeCloudProjects,
    refreshRecentWorkspaceList,
    resetDataNodeActions,
    setBranchSwitcherOpen,
    setRestoreWorkspaceError,
    setRightSidebarOpen,
  ]);

  const navigateDesktopView = useCallback((view: DesktopView) => {
    const requestId = ++desktopViewNavigationRequestRef.current;
    const routesToData = (
      (view === "plugins" && (workspaceIsCloud || !experimentalSettings.enableViewerPlugins))
      || (workspaceIsCloud && view === "cloud")
      || (!workspaceIsCloud && (view === "access" || view === "automation"))
      || (view === "cloud" && !cloudEnabled)
      || ((view === "access" || view === "automation") && !cloudEnabled)
    );

    const commitNavigation = async () => {
      if (activeView === "data" && view !== "data" && !routesToData) {
        try {
          await flushActiveDocumentSessions("document-close");
        } catch (error) {
          if (requestId === desktopViewNavigationRequestRef.current) {
            setDocumentNavigationError(error instanceof Error ? error.message : String(error));
          }
          return;
        }
      }
      if (requestId !== desktopViewNavigationRequestRef.current) return;
      setDocumentNavigationError(null);

      if (view === "plugins" && (workspaceIsCloud || !experimentalSettings.enableViewerPlugins)) {
        setActiveView("data");
        setSidebarCollapsed(false);
        setSwitcherOpen(false);
        return;
      }

      if (workspaceIsCloud && view === "cloud") {
        setActiveView("data");
        setSidebarCollapsed(false);
        setSwitcherOpen(false);
        return;
      }

      if (!workspaceIsCloud && (view === "access" || view === "automation")) {
        setActiveView("data");
        setSidebarCollapsed(false);
        setSwitcherOpen(false);
        return;
      }

      if (view === "cloud" && !cloudEnabled) {
        setActiveView("data");
        setSidebarCollapsed(false);
        setSwitcherOpen(false);
        return;
      }

      if ((view === "access" || view === "automation") && !cloudEnabled) {
        setActiveView("data");
        setSidebarCollapsed(false);
        setSwitcherOpen(false);
        return;
      }

      if (view === "cloud") {
        if (cloudSessionRestoring && !cloudWorkspaceAvailable) {
          setActiveView("cloud");
          setSidebarCollapsed(false);
          setSwitcherOpen(false);
          return;
        }
        setActiveView("cloud");
        setActiveCloudSection(
          resolvedCloudProjectId
            ? "contents"
            : "overview",
        );
        setSidebarCollapsed(false);
        setSwitcherOpen(false);
        return;
      }

      setActiveView(view);
      setSidebarCollapsed(false);
      setSwitcherOpen(false);
    };

    void commitNavigation();
  }, [
    activeView,
    cloudEnabled,
    cloudSessionRestoring,
    cloudWorkspaceAvailable,
    experimentalSettings.enableViewerPlugins,
    resolvedCloudProjectId,
    setSidebarCollapsed,
    workspaceIsCloud,
  ]);

  const handleActiveDataPathChange = useCallback(async (
    path: string | null,
    node: DataNode | null = null,
    context?: DataWorkspaceActivePathChangeContext,
  ) => {
    const requestId = ++documentNavigationRequestRef.current;
    if (path !== activeDataPath && !context?.documentSessionsDrained) {
      try {
        await flushActiveDocumentSessions("document-switch");
      } catch (error) {
        if (requestId === documentNavigationRequestRef.current) {
          setDocumentNavigationError(error instanceof Error ? error.message : String(error));
        }
        throw error;
      }
    }
    if (requestId !== documentNavigationRequestRef.current) return;
    setDocumentNavigationError(null);
    setActiveDataPath(path);
    setActiveDataNode(node);
  }, [activeDataPath]);
  const handleActiveDataNodeChange = useCallback((node: DataNode | null) => {
    setActiveDataNode((current) => (
      hasSameActiveDataNodeIdentity(current, node) ? current : node
    ));
  }, []);

  const handleFilesVisibilitySettingsChange = useCallback((nextSettings: FilesVisibilitySettings) => {
    setFilesVisibilitySettings(nextSettings);
    setWorkspaceRefreshToken((token) => token + 1);
  }, [setFilesVisibilitySettings]);

  const handlePuppyoneConfigChange = useCallback(async (nextConfig: PuppyoneWorkspaceConfig) => {
    const savedConfig = await savePuppyoneConfig(nextConfig);
    if (savedConfig) {
      setWorkspaceRefreshToken((token) => token + 1);
      await refreshGitStatus("configuration");
    }
    return savedConfig;
  }, [refreshGitStatus, savePuppyoneConfig]);

  useCloudWorkspaceContext({
    activeCloudSession,
    activeGitStatus,
    cloudEnabled,
    desktopCloudApiBaseUrl,
    resolutionInputsLoading: cloudResolutionInputsLoading,
    setRecentWorkspaceCloudContexts,
    updateCloudSession,
    workspace,
    workspaceIsCloud,
  });

  const {
    setWorkspaceSurfaceDialogOpen,
    setWorkspaceSurfaceError,
    workspaceSurfaceAction,
    workspaceSurfaceDialogOpen,
    workspaceSurfaceError,
    workspaceSurfaceResolvePending,
    workspaceSurfaceSwitching,
  } = useWorkspaceSurfaceSwitch({
    activeCloudSession,
    cloudOnlyWorkspaceEnabled,
    cloudProjectId: cloudOnlyProjectId,
    desktopCloudApiBaseUrl,
    handleWorkspaceOpenResult,
    homeCloudProjects,
    openCloudProjectFromHomepage,
    recentWorkspaceCloudContexts,
    recentWorkspaceItems,
    refreshRecentWorkspaceList,
    setHomeOperationStatus,
    setRecentWorkspaceCloudContexts,
    showBrowserSignInStatus,
    startCloudBrowserSignIn,
    updateCloudSession,
    workspace,
    workspaceIsCloud,
  });

  const closeSwitcher = useCallback(() => {
    setSwitcherOpen(false);
  }, []);
  const activeExternalOpen = useActiveExternalOpenTarget({
    activeDataNode,
    activeDataPath,
    activeViewIsData: activeView === "data",
    externalAppsSettings,
    onActionSettled: closeSwitcher,
    onError: setWorkspaceSurfaceError,
    setExternalAppsSettings,
    workspace,
    workspaceIsCloud,
  });

  const handleCloudSessionChange = useCallback((session: DesktopCloudSession | null) => {
    if (!cloudEnabled) return;

    updateCloudSession(session);
    if (!session) {
      if (activeView === "settings") {
        setActiveSettingsSection("account");
        return;
      }
      setActiveView(workspaceIsCloud ? "data" : "cloud");
      setActiveCloudSection("overview");
      setSidebarCollapsed(false);
      setSwitcherOpen(false);
    }
  }, [activeView, cloudEnabled, setSidebarCollapsed, updateCloudSession, workspaceIsCloud]);

  const handleConfigureCloudRemote = useCallback(async (
    projectId?: string | null,
    options: CloudGitRemoteOptions = {},
  ) => {
    if (!cloudEnabled) return null;
    if (!workspace) return null;
    if (workspaceIsCloud) return null;
    const context = captureGitRepositoryContext(workspace.path);
    if (!context) return null;
    const nextProjectId = projectId?.trim() || null;
    if (!nextProjectId) {
      throw new Error("Choose a Cloud Project before configuring its Git remote.");
    }
    if (!activeCloudSession) {
      throw new Error("Sign in before configuring the Cloud Git remote.");
    }
    let previousConfig: PuppyoneWorkspaceConfig | null = null;
    let configUpdated = false;
    let issued: Awaited<ReturnType<typeof issueWorkspaceGitRemote>> | null = null;
    let configuredStatus = activeGitStatus;
    try {
      const project = homeCloudProjects.find((entry) => entry.id === nextProjectId)
        ?? await getCloudProject(
          activeCloudSession,
          nextProjectId,
          updateCloudSession,
          desktopCloudApiBaseUrl,
        );
      issued = await issueWorkspaceGitRemote({
        session: activeCloudSession,
        apiBaseUrl: desktopCloudApiBaseUrl,
        project,
        projectId: nextProjectId,
        target: options.target,
        onSessionChange: updateCloudSession,
      });
      previousConfig = puppyoneConfig
        ?? await readPuppyoneWorkspaceConfig(context.rootPath);
      const nextConfig = mergePuppyoneWorkspaceConfig(previousConfig, {
        sync: {
          sourceOfTruth: {
            service: "puppyone",
            remote: "puppyone",
            branch: null,
          },
        },
        backup: {
          enabled: true,
          service: "puppyone",
          remote: "puppyone",
          branch: null,
        },
        git: {
          primaryRemote: "puppyone",
          watchedBranch: null,
        },
      });
      const savedConfig = await handlePuppyoneConfigChange(nextConfig);
      if (!savedConfig) {
        throw new Error("Unable to persist the local Git sync settings for this workspace.");
      }
      configUpdated = true;
      configuredStatus = await configureWorkspaceCloudRemote(
        context.rootPath,
        issued.remoteUrl,
        "puppyone",
        issued.credential,
        issued.username,
      );
    } catch (error) {
      if (issued) {
        await revokeCloudGitCredential(
          activeCloudSession,
          issued.project.id,
          issued.credentialId,
          updateCloudSession,
          desktopCloudApiBaseUrl,
        ).catch(() => undefined);
      }
      if (configUpdated && previousConfig) {
        await handlePuppyoneConfigChange(previousConfig).catch(() => undefined);
      }
      throw error;
    }
    if (!issued || !configuredStatus) {
      throw new Error("Cloud Git remote configuration did not return a Git status.");
    }
    setRecentWorkspaceCloudContexts((current) => ({
      ...current,
      [workspace.id]: {
        projectId: nextProjectId,
        target: issued.target,
        hasCloudRemote: true,
        error: null,
        reason: null,
      },
    }));
    if (applyGitStatus(
      configuredStatus,
      context,
      createRepositoryRefreshReason("configure-remote", "mutation"),
    )) {
      refreshWorkspaceContent();
    }
    return configuredStatus;
  }, [
    applyGitStatus,
    activeGitStatus,
    activeCloudSession,
    captureGitRepositoryContext,
    cloudEnabled,
    desktopCloudApiBaseUrl,
    handlePuppyoneConfigChange,
    homeCloudProjects,
    puppyoneConfig,
    refreshWorkspaceContent,
    setRecentWorkspaceCloudContexts,
    updateCloudSession,
    workspace,
    workspaceIsCloud,
  ]);

  const handleRemoveCloudRemote = useCallback(async () => {
    if (!workspace || workspaceIsCloud) return;
    const refreshedStatus = await removeWorkspaceGitRemote(workspace.path, "puppyone");
    const nextConfig = mergePuppyoneWorkspaceConfig(puppyoneConfig, {
      sync: {
        sourceOfTruth: { service: "puppyone", remote: null, branch: null },
      },
      backup: {
        enabled: false,
        service: "puppyone",
        remote: null,
        branch: null,
      },
      git: {
        primaryRemote: null,
        watchedBranch: null,
      },
    });
    const savedConfig = await handlePuppyoneConfigChange(nextConfig);
    if (!savedConfig) {
      throw new Error("The PuppyOne Git remote was removed, but Desktop could not update the local sync settings.");
    }
    setRecentWorkspaceCloudContexts((current) => ({
      ...current,
      [workspace.id]: {
        projectId: null,
        hasCloudRemote: false,
        error: null,
        reason: null,
      },
    }));
    const context = captureGitRepositoryContext(workspace.path);
    if (context && applyGitStatus(
      refreshedStatus,
      context,
      createRepositoryRefreshReason("configure-remote", "mutation"),
    )) {
      refreshWorkspaceContent();
    }
    setActiveCloudSection("overview");
  }, [
    applyGitStatus,
    captureGitRepositoryContext,
    handlePuppyoneConfigChange,
    puppyoneConfig,
    refreshWorkspaceContent,
    setRecentWorkspaceCloudContexts,
    workspace,
    workspaceIsCloud,
  ]);

  const {
    cloudBackupError,
    cloudBackupLoading,
    handleStartPuppyoneBackup,
  } = usePuppyoneCloudBackup({
    activeCloudSession,
    activeGitStatus,
    applyGitStatus,
    captureGitRepositoryContext,
    clearGitSelection,
    cloudEnabled,
    handleCloudSessionChange,
    onConfigureCloudRemote: handleConfigureCloudRemote,
    isGitRepositoryContextCurrent,
    refreshWorkspaceContent,
    setActiveCloudSection,
    setActiveView,
    setGitOperationError,
    setGitOperationLoading,
    setSidebarCollapsed,
    setSwitcherOpen,
    workspace,
    workspaceIsCloud,
  });
  const cloudBackupErrorMessage = cloudBackupError
    ? formatCloudMessage(cloudBackupError, t)
    : null;

  const unlinkCurrentWorkspace = useCallback(async () => {
    if (!await drainWorkspaceNavigation()) return;
    await forgetActiveWorkspace({ workspaceIsCloud });
    setSwitcherOpen(false);
    setBranchSwitcherOpen(false);
    setRightSidebarOpen(false);
    resetDataNodeActions();
    setHomeOperationStatus(null);
  }, [
    drainWorkspaceNavigation,
    forgetActiveWorkspace,
    resetDataNodeActions,
    setBranchSwitcherOpen,
    setRightSidebarOpen,
    workspaceIsCloud,
  ]);

  const toggleWorkspaceSwitcher = useCallback(() => {
    const nextOpen = !switcherOpen;
    setSwitcherOpen(nextOpen);
    setBranchSwitcherOpen(false);
    if (nextOpen) void refreshHomeCloudProjects();
  }, [refreshHomeCloudProjects, setBranchSwitcherOpen, switcherOpen]);

  const toggleBranchSwitcher = useCallback(() => {
    setBranchSwitcherOpen((open) => !open);
    setSwitcherOpen(false);
  }, [setBranchSwitcherOpen]);

  const closeBranchSwitcher = useCallback(() => {
    setBranchSwitcherOpen(false);
  }, [setBranchSwitcherOpen]);

  if (restoringWorkspace && !workspace) {
    return (
      <RestoringWorkspaceScreen
        themeMode={themeMode}
        lightThemePreset={lightThemePreset}
        darkThemePreset={darkThemePreset}
        textSize={textSize}
        typography={typography}
        pointerCursors={pointerCursors}
        diffMarkers={diffMarkers}
        resolvedTheme={resolvedTheme}
      />
    );
  }

  if (!workspace) {
    return (
      <>
        <Homepage
          onChooseWorkspace={openFolder}
          onCreateCloudProject={cloudOnlyEntryEnabled ? createCloudProjectFromHomepage : undefined}
          onOpenCloudProject={cloudOnlyEntryEnabled ? openCloudProjectFromHomepage : undefined}
          onOpenWorkspacePath={openWorkspacePath}
          recentWorkspaces={recentWorkspaceItems}
          cloudProjects={cloudOnlyEntryEnabled ? homeCloudProjects : []}
          projectItems={homeProjectItems}
          cloudSignedIn={cloudOnlyEntryEnabled && Boolean(activeCloudSession)}
          cloudProjectsLoading={cloudOnlyEntryEnabled && Boolean(activeCloudSession) && (homeCloudProjectsLoading || cloudSessionRestoring)}
          cloudProjectsError={cloudOnlyEntryEnabled ? homeCloudProjectsError : null}
          operationStatus={homeOperationStatus}
          initialError={restoreWorkspaceError}
          themeMode={themeMode}
          lightThemePreset={lightThemePreset}
          darkThemePreset={darkThemePreset}
          textSize={textSize}
          typography={typography}
          pointerCursors={pointerCursors}
          diffMarkers={diffMarkers}
          resolvedTheme={resolvedTheme}
        />
        <DesktopOverlayPortal
          theme={resolvedTheme}
          lightThemePreset={lightThemePreset}
          darkThemePreset={darkThemePreset}
          textSize={textSize}
          typography={typography}
          pointerCursors={pointerCursors}
          diffMarkers={diffMarkers}
        >
          <CloudServicePanel
            open={cloudPanelOpen}
            status={null}
            accountEmail={storedCloudAccountEmail}
            loading={cloudSessionRestoring}
            error={null}
            onClose={() => {
              setCloudPanelOpen(false);
              setPendingCloudProjectCreate(false);
            }}
            onRefresh={() => void refreshHomeCloudProjects()}
            onSignedIn={(session) => {
              handleCloudSessionChange(session);
              setCloudPanelOpen(false);
              if (!pendingCloudProjectCreate) {
                void refreshHomeCloudProjects();
              }
            }}
            onSignedOut={() => {
              handleCloudSessionChange(null);
              setCloudPanelOpen(false);
              setPendingCloudProjectCreate(false);
              setHomeCloudProjects([]);
              setHomeCloudProjectsError(null);
            }}
            onEnterCloud={() => {
              setCloudPanelOpen(false);
              void refreshHomeCloudProjects();
            }}
            onOpenGitSettings={() => setCloudPanelOpen(false)}
          />
        </DesktopOverlayPortal>
      </>
    );
  }

  const workspaceSwitcherItems = getWorkspaceSwitcherItems({
    cloudProjects: homeCloudProjects,
    includeCloud: cloudOnlyEntryEnabled,
    workspaces,
  });

  const titlebarSlot = (
    <DesktopTitlebarContext
      activeGitStatus={activeGitStatus}
      branchSwitcherOpen={branchSwitcherOpen}
      branchSwitcherRef={branchSwitcherRef}
      compact={minimalMode}
      gitStatusLoading={gitStatusLoading}
      gitOperationLoading={gitOperationLoading}
      localBranches={localBranches}
      remoteBranches={remoteBranches}
      workspace={workspace}
      workspaceKind={workspaceIsCloud ? "cloud" : "local"}
      workspaceIsCloud={workspaceIsCloud}
      workspaceSwitcherItems={workspaceSwitcherItems}
      workspaceSwitcherOpen={switcherOpen}
      workspaceSwitcherRef={switcherRef}
      onCheckoutBranch={handleCheckoutGitBranch}
      onCreateCloudProject={cloudOnlyEntryEnabled ? createCloudProjectFromHomepage : undefined}
      onGoHome={() => void goToHomepage()}
      onOpenFolder={openFolder}
      onOpenWorkspaceSwitcherItem={openWorkspaceSwitcherItem}
      onCloseBranchSwitcher={closeBranchSwitcher}
      onToggleBranchSwitcher={toggleBranchSwitcher}
      onToggleWorkspaceSwitcher={toggleWorkspaceSwitcher}
    />
  );

  const titlebarActions = (
    <DesktopTitlebarActions
      desktopUpdates={desktopUpdates}
      canOpenActiveFileExternal={activeExternalOpen.canOpen}
      activeFileExternalOpenTitle={activeExternalOpen.title}
      activeFileExternalOpenAppName={activeExternalOpen.appName}
      activeFileExternalOpenIconDataUrl={activeExternalOpen.iconDataUrl}
      activeFileExternalOpenLoading={activeExternalOpen.loading}
      titlebarActionsSettings={titlebarActionsSettings}
      terminalSidebarOpen={rightSidebarOpen && desktopTerminalEnabled && rightSidebarSurface === "terminal"}
      terminalToolEnabled={desktopTerminalEnabled}
      agentChatEnabled={desktopAgentChatEnabled}
      agentChatSidebarOpen={rightSidebarOpen && desktopAgentChatEnabled && rightSidebarSurface === "chat"}
      onOpenActiveFileExternal={() => void activeExternalOpen.openActiveFileExternal()}
      onToggleTerminal={() => {
        const terminalIsOpen = rightSidebarOpen && rightSidebarSurface === "terminal";
        setRightSidebarSurface("terminal");
        setRightSidebarOpen(!terminalIsOpen);
        setSwitcherOpen(false);
      }}
      onClearTerminal={() => terminalPanelRef.current?.clear()}
      onResetTerminal={() => terminalPanelRef.current?.reset()}
      onToggleAgentChat={() => {
        if (!desktopAgentChatEnabled) return;
        const chatIsOpen = rightSidebarOpen && rightSidebarSurface === "chat";
        setRightSidebarSurface("chat");
        setRightSidebarOpen(!chatIsOpen);
        setSwitcherOpen(false);
      }}
      onUpdateNow={() => {
        void desktopUpdates.updateNow();
        setSwitcherOpen(false);
      }}
    />
  );

  const minimalModeDock = minimalMode ? (
    <Suspense fallback={null}>
      <DesktopMinimalModeDock
        activeView={activeView}
        cloudHubEnabled={cloudEnabled && !workspaceIsCloud}
        cloudToolsEnabled={cloudEnabled && workspaceIsCloud && Boolean(effectiveCloudProjectId)}
        contextMenuOpen={switcherOpen || branchSwitcherOpen}
        contextSlot={titlebarSlot}
        pluginsEnabled={
          experimentalSettings.enableViewerPlugins
          && !workspaceIsCloud
          && preferences.sidebarNavigationVisibilitySettings.enabled.plugins
        }
        titlebarActions={titlebarActions}
        workspaceKind={workspaceIsCloud ? "cloud" : "local"}
        workspaceSurfaceAction={workspaceSurfaceAction}
        onNavigate={navigateDesktopView}
        onExitMinimalMode={() => preferences.setExperimentalSettings({
          ...experimentalSettings,
          enableMinimalMode: false,
        })}
      />
    </Suspense>
  ) : undefined;

  return (
    <div
      className={`app-shell cloud-runtime ${resolvedTheme === "dark" ? "dark" : ""}`}
      data-minimal-mode={minimalMode ? "true" : undefined}
      data-theme-mode={themeMode}
      data-light-theme-preset={lightThemePreset}
      data-dark-theme-preset={darkThemePreset}
      data-text-size={textSize}
      data-pointer-cursors={pointerCursors ? "true" : "false"}
      data-diff-markers={diffMarkers}
      {...typographyRootProps}
    >
      <DesktopCloudShell
        minimalMode={minimalMode}
        minimalModeDock={minimalModeDock}
        workspaceKind={workspaceIsCloud ? "cloud" : "local"}
        titlebarSlot={titlebarSlot}
        titlebarActions={titlebarActions}
        rightSidebarOpen={rightSidebarOpen && desktopRightSidebarEnabled}
        resizableRightSidebar
        rightSidebarWidth={rightSidebarWidth}
        minRightSidebarWidth={MIN_RIGHT_SIDEBAR_WIDTH}
        maxRightSidebarWidth={MAX_RIGHT_SIDEBAR_WIDTH}
        onRightSidebarWidthChange={setRightSidebarWidth}
        rightSidebar={desktopRightSidebarEnabled ? (
          <div className="desktop-right-sidebar-stack" key={workspace.path}>
            {desktopTerminalEnabled && (
              <div
                className={`desktop-right-sidebar-surface ${rightSidebarSurface === "terminal" ? "is-active" : ""}`}
                aria-hidden={rightSidebarSurface !== "terminal"}
              >
                <RightTerminalPanel
                  ref={terminalPanelRef}
                  workspace={workspace}
                  active={rightSidebarOpen && rightSidebarSurface === "terminal"}
                />
              </div>
            )}
            {desktopAgentChatEnabled && (
              <div
                className={`desktop-right-sidebar-surface ${rightSidebarSurface === "chat" ? "is-active" : ""}`}
                aria-hidden={rightSidebarSurface !== "chat"}
              >
                <Suspense fallback={null}>
                  <RightAgentPanel
                    workspace={workspace}
                    active={rightSidebarOpen && rightSidebarSurface === "chat"}
                    minimalMode={minimalMode}
                    preferredRuntimeId={agentPreferredRuntime}
                    onPreferredRuntimeChange={setAgentPreferredRuntime}
                    preferredModel={agentPreferredModel}
                    onPreferredModelChange={setAgentPreferredModel}
                    onViewChanges={() => {
                      setActiveView("git");
                      setSidebarCollapsed(false);
                    }}
                    onOpenFile={(path) => {
                      handleActiveDataPathChange(path);
                      navigateDesktopView("data");
                    }}
                  />
                </Suspense>
              </div>
            )}
          </div>
        ) : undefined}
      >
        <DesktopWorkspaceContent
          activeAiEditRequest={activeAiEditRequest}
          activeDataPath={activeDataPath}
          activeView={activeView}
          cloud={{
            activeSection: activeCloudSection,
            projectContext: workspaceIsCloud ? null : projectCloudContext,
            backupError: cloudBackupErrorMessage,
            backupLoading: cloudBackupLoading,
            cloudApiBaseUrl: desktopCloudApiBaseUrl,
            cloudSession: activeCloudSession,
            storedCloudSession: cloudSession,
            enabled: cloudEnabled,
            projectId: effectiveCloudProjectId,
            sessionRestoring: cloudSessionRestoring,
            onCloudSessionChange: handleCloudSessionChange,
            onRemoveCloudRemote: handleRemoveCloudRemote,
            onOpenDetails: () => {
              if (!cloudEnabled) return;
              navigateDesktopView("cloud");
            },
            onOpenGitSettings: () => {
              setActiveSettingsSection("git");
              navigateDesktopView("settings");
            },
            onSelectSection: setActiveCloudSection,
            onStartPuppyoneBackup: handleStartPuppyoneBackup,
          }}
          dataPort={dataPort}
          desktopUpdates={desktopUpdates}
          git={git}
          minimalMode={minimalMode}
          onActiveDataNodeChange={handleActiveDataNodeChange}
          onActiveDataPathChange={handleActiveDataPathChange}
          onCreateEntryMenu={openCreateEntryMenu}
          fileClipboardController={fileClipboardController}
          onFilesVisibilitySettingsChange={handleFilesVisibilitySettingsChange}
          onNavigate={navigateDesktopView}
          onNodeActionMenu={openNodeActionMenu}
          onOpenSettings={() => navigateDesktopView("settings")}
          onPuppyoneConfigChange={handlePuppyoneConfigChange}
          onSelectSettingsSection={setActiveSettingsSection}
          onUnlinkWorkspace={unlinkCurrentWorkspace}
          preferences={preferences}
          puppyoneConfig={puppyoneConfig}
          puppyoneConfigError={puppyoneConfigError}
          puppyoneConfigLoading={puppyoneConfigLoading}
          puppyoneConfigSaving={puppyoneConfigSaving}
          settingsSection={activeSettingsSection}
          workspace={workspace}
          workspaceSurfaceError={documentNavigationError
            ?? (workspaceSurfaceDialogOpen ? null : workspaceSurfaceError)}
          workspaceSurfaceAction={workspaceSurfaceAction}
          workspaceKind={workspaceIsCloud ? "cloud" : "local"}
          workspaceKey={workspaceKey}
          workspaceRefreshToken={workspaceRefreshToken}
        />
      </DesktopCloudShell>
      <DesktopOverlayPortal
        theme={resolvedTheme}
        lightThemePreset={lightThemePreset}
        darkThemePreset={darkThemePreset}
        textSize={textSize}
        typography={typography}
        pointerCursors={pointerCursors}
        diffMarkers={diffMarkers}
      >
        <>
          {pendingBranchSwitch && (
            <BranchSwitchConflictDialog
              branchName={pendingBranchSwitch.branchName}
              changeCount={pendingBranchSwitch.changeCount}
              error={pendingBranchSwitch.error}
              loading={gitOperationLoading === "stash" || gitOperationLoading === "commit-switch"}
              operationLoading={gitOperationLoading}
              onCancel={() => setPendingBranchSwitch(null)}
              onStashAndSwitch={() => void handleStashAndCheckoutBranch()}
              onCommitAndSwitch={() => void handleCommitAndCheckoutBranch()}
            />
          )}
          {gitOperationError && !pendingBranchSwitch && (
            <GitOperationErrorDialog
              error={gitOperationError}
              onClose={dismissGitOperationError}
            />
          )}
          {createEntryDraft && (
            createEntryDraft.selectedKind ? (
              <DesktopCreateEntryDialog
                draft={createEntryDraft}
                fileIconTheme={fileIconTheme}
                onChange={setCreateEntryDraft}
                onCancel={() => setCreateEntryDraft(null)}
                onCreate={createEntryFromMenu}
              />
            ) : (
              <DesktopCreateEntryMenu
                draft={createEntryDraft}
                experimentalSettings={preferences.experimentalSettings}
                fileIconTheme={fileIconTheme}
                onCancel={() => setCreateEntryDraft(null)}
                onPaste={() => {
                  setCreateEntryDraft(null);
                  void fileClipboardController.pasteNodes(createEntryDraft.parentPath);
                }}
                pasteDisabled={!fileClipboardController.canPasteInto(createEntryDraft.parentPath)}
                pasteLabel={t("workspace.node.pasteItems", {
                  count: fileClipboardController.clipboard?.nodes.length ?? 0,
                })}
                onSelectKind={selectCreateEntryKind}
              />
            )
          )}
          {nodeActionMenu && (
            <DesktopNodeActionMenu
              draft={nodeActionMenu}
              experimentalSettings={preferences.experimentalSettings}
              showRevealInFinder={!workspaceIsCloud}
              showOpenInDefaultApp={!workspaceIsCloud}
              canPaste={nodeActionMenu.node.type === "folder" && fileClipboardController.canPasteInto(nodeActionMenu.node.path)}
              canCopy={fileClipboardController.canCopy}
              canCut={fileClipboardController.canCut}
              canDuplicate={fileClipboardController.canDuplicate}
              onChange={setNodeActionMenu}
              onCancel={() => setNodeActionMenu(null)}
              onCopy={() => {
                fileClipboardController.copyNodes(nodeActionMenu.nodes);
                setNodeActionMenu(null);
              }}
              onCut={() => {
                fileClipboardController.cutNodes(nodeActionMenu.nodes);
                setNodeActionMenu(null);
              }}
              onPaste={() => {
                setNodeActionMenu(null);
                void fileClipboardController.pasteNodes(nodeActionMenu.node.path);
              }}
              onDuplicate={() => {
                setNodeActionMenu(null);
                void fileClipboardController.duplicateNodes(nodeActionMenu.nodes);
              }}
              onCreateInside={() => openCreateEntryMenu(nodeActionMenu.node.path, nodeActionMenu.anchor)}
              onRename={renameNodeFromMenu}
              onDelete={deleteNodeFromMenu}
              onOpenInDefaultApp={openNodeInDefaultAppFromMenu}
              onRevealInFinder={revealNodeInFinderFromMenu}
            />
          )}
          {cloudPanelOpen && (
            <CloudServicePanel
              open={cloudPanelOpen}
              status={null}
              accountEmail={storedCloudAccountEmail}
              loading={cloudSessionRestoring}
              error={null}
              onClose={() => {
                setCloudPanelOpen(false);
                setPendingCloudProjectCreate(false);
              }}
              onRefresh={() => setWorkspaceRefreshToken((token) => token + 1)}
              onSignedIn={(session) => {
                handleCloudSessionChange(session);
                setCloudPanelOpen(false);
                if (!pendingCloudProjectCreate) setWorkspaceRefreshToken((token) => token + 1);
              }}
              onSignedOut={() => {
                handleCloudSessionChange(null);
                setCloudPanelOpen(false);
                setPendingCloudProjectCreate(false);
                setWorkspaceRefreshToken((token) => token + 1);
              }}
              onEnterCloud={() => {
                setCloudPanelOpen(false);
                setWorkspaceRefreshToken((token) => token + 1);
              }}
              onOpenGitSettings={() => setCloudPanelOpen(false)}
            />
          )}
          {workspaceSurfaceDialogOpen && (
            <CloudProjectResolveDialog
              error={workspaceSurfaceResolvePending ? null : workspaceSurfaceError}
              resolving={workspaceSurfaceSwitching}
              onClose={() => {
                if (workspaceSurfaceSwitching) return;
                setWorkspaceSurfaceDialogOpen(false);
                setWorkspaceSurfaceError(null);
              }}
            />
          )}
        </>
      </DesktopOverlayPortal>
    </div>
  );
}

function hasSameActiveDataNodeIdentity(left: DataNode | null, right: DataNode | null): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.id === right.id
    && left.path === right.path
    && left.name === right.name
    && left.type === right.type
    && left.mimeType === right.mimeType;
}
