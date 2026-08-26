import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  closeAllDocumentWorkingCopies,
  closeDocumentWorkingCopy,
  closeDocumentWorkingCopiesUnderResource,
  flushActiveDocumentSessions,
  isDocumentDataNode,
  type DataNode,
} from "@puppyone/shared-ui";
import { useLocalization } from "@puppyone/localization";
import { DesktopCloudShell, type DesktopView } from "./components/DesktopCloudShell";
import { isSettingsSectionAvailable, type SettingsSection } from "./features/settings";
import { type CloudWorkspaceSection } from "./features/cloud";
import {
  MinimalOnboarding,
} from "./components/MinimalOnboarding";
import { AssetLibraryHome } from "./components/AssetLibraryHome";
import { isDesktopAgentChatEnabled, loadRightAgentPanel } from "./features/desktop-agent/lazy";
import {
  isDesktopTerminalEnabled,
  RightTerminalPanel,
} from "./features/desktop-terminal";
import { useDesktopUpdates } from "./features/updates";
import {
  createLocalDataPort,
  createLocalDocumentStorageIdentity,
  readPuppyoneWorkspaceConfig,
  removeWorkspaceGitRemote,
  showHomepage,
} from "./lib/localFiles";
import { openWorkspaceTarget } from "./lib/workspaceOpening";
import {
  getDesktopCloudApiBaseUrl,
  isCloudSessionForApiBase,
  type DesktopCloudSession,
} from "./lib/cloudApi";
import {
  resolveVisibleCreateNewMenuItems,
  type FilesVisibilitySettings,
} from "./preferences";
import type { PuppyoneWorkspaceConfig } from "./types/electron";
import {
  getWorkspaceSwitcherItems,
} from "./features/app-shell/workspaceHomeModel";
import {
  mergePuppyoneWorkspaceConfig,
} from "./features/app-shell/preferences";
import { DesktopTitlebarContext } from "./features/app-shell/DesktopTitlebarContext";
import { DesktopWorkspaceContent } from "./features/app-shell/DesktopWorkspaceContent";
import { DesktopTitlebarActions } from "./features/app-shell/DesktopTitlebarActions";
import {
  DesktopShellLocationBar,
  resolveDesktopShellLocationPath,
  resolveDesktopShellWorkspaceEntryPath,
} from "./features/app-shell/DesktopShellLocationBar";
import { DesktopOverlayPortal } from "./features/app-shell/DesktopOverlayPortal";
import { DesktopHelpLauncher } from "./features/app-shell/DesktopHelpLauncher";
import type { DesktopWorkspaceSwitcherItem } from "./features/app-shell/DesktopWorkspaceSwitcher";
import { RestoringWorkspaceScreen } from "./features/app-shell/RestoringWorkspaceScreen";
import { useDesktopPreferences } from "./features/app-shell/useDesktopPreferences";
import { isAssetLibraryHomeEnabled } from "./features/app-shell/homeFeatureGate";
import { useWorkspaceLifecycle } from "./features/app-shell/useWorkspaceLifecycle";
import { usePuppyoneConfig } from "./features/app-shell/usePuppyoneConfig";
import { useExternalFileOpen } from "./features/external-apps/useExternalFileOpen";
import { useDesktopCloudSession } from "./features/cloud/hooks/useDesktopCloudSession";
import {
  getResolvedCloudProjectId,
  resolveCloudHubSectionAfterContextChange,
  useCurrentRepositoryCloudContext,
} from "./features/cloud/project/context";
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
import { shouldBlockWorkspaceCloudResolution } from "./features/cloud/workspace/workspaceCloudResolutionKey";
import { useCloudInitialization } from "./features/cloud/initialization/useCloudInitialization";
import {
  createTypographyRootProps,
  useTypographyCatalog,
  useTypographyRuntime,
} from "./features/typography";
import { useDesktopEditorWorkbench } from "./features/editor-workbench/controller/useDesktopEditorWorkbench";

const RightAgentPanel = lazy(loadRightAgentPanel);

export function App() {
  return <AppContent />;
}

function AppContent() {
  const { locale, t } = useLocalization();
  const desktopUpdates = useDesktopUpdates();
  const [activeView, setActiveView] = useState<DesktopView>("data");
  const preferences = useDesktopPreferences();
  const { setRightSidebarOpen } = preferences;
  const fontCatalog = useTypographyCatalog();
  const typography = useTypographyRuntime(
    preferences.typographyPreferences,
    fontCatalog,
    locale,
  );
  const typographyRootProps = useMemo(() => createTypographyRootProps(typography), [typography]);
  const cloudAvailable = useFeatureFlag("cloudWorkspace");
  // The build flag only marks availability; PuppyOne Cloud stays hidden until
  // the user opts into the experiment in Settings.
  const cloudEnabled = cloudAvailable && preferences.experimentalSettings.enableCloudWorkspace;
  const assetLibraryHomeAvailable = useFeatureFlag("assetLibraryHome");
  const agentChatAvailable = useFeatureFlag("desktopAgentChat");
  const {
    cloudSession,
    cloudSessionRestoring,
    handleCloudSessionChange: updateCloudSession,
  } = useDesktopCloudSession(cloudEnabled);
  const [activeCloudSection, setActiveCloudSection] = useState<CloudWorkspaceSection>("initialize");
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const {
    chooseProjectLocation,
    clearWorkspace,
    cloneRepository,
    createProject,
    forgetActiveWorkspace,
    handleWorkspaceOpenResult,
    openDroppedWorkspace,
    openFolder,
    openWorkspacePath,
    recentWorkspaceItems,
    removeWorkspaceFromRecents,
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
      setRightSidebarOpen(true);
    }, [setRightSidebarOpen]),
    onWorkspaceCleared: useCallback(() => {
      setActiveView("data");
      setSwitcherOpen(false);
    }, []),
    onWorkspaceOpenSettled: useCallback(() => {
      setSwitcherOpen(false);
    }, []),
  });
  const documentStorageIdentity = workspace
    ? createLocalDocumentStorageIdentity(workspace.path)
    : null;
  const {
    activeThemeMode,
    aiEditAssistEnabled,
    createNewMenuSettings,
    explorerWidth,
    experimentalSettings,
    fileIconTheme,
    filesVisibilitySettings,
    interfaceStyle,
    resolvedAppearance,
    resolvedTheme,
    rightSidebarOpen,
    rightSidebarToolsSettings,
    rightSidebarWidth,
    rightSidebarSurface,
    agentPreferredRuntime,
    agentPreferredModel,
    localAgentsSettings,
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
    setAiEditAssistEnabled,
    setExplorerWidth,
    setFileIconTheme,
    setFilesVisibilitySettings,
    setRightSidebarToolsSettings,
    setRightSidebarWidth,
    setRightSidebarSurface,
    setAgentPreferredRuntime,
    setAgentPreferredModel,
    setSidebarCollapsed,
    setSidebarNavigationLayout,
    setThemeMode,
  } = preferences;
  const createNewItems = useMemo(
    () => resolveVisibleCreateNewMenuItems(createNewMenuSettings, experimentalSettings),
    [createNewMenuSettings, experimentalSettings],
  );
  const assetLibraryHomeEnabled = isAssetLibraryHomeEnabled({
    available: assetLibraryHomeAvailable,
    optedIn: experimentalSettings.enableAssetLibraryHome,
  });
  const Homepage = assetLibraryHomeEnabled ? AssetLibraryHome : MinimalOnboarding;
  const [activeSettingsSection, setActiveSettingsSection] = useState<SettingsSection>("general");
  const [workspaceRefreshToken, setWorkspaceRefreshToken] = useState({
    sequence: 0,
    paths: null as readonly string[] | null,
  });
  const localDataPort = useMemo(
    () => (workspace ? createLocalDataPort(workspace.path) : null),
    [workspace],
  );
  const dataPort = useMemo(
    () => (localDataPort ? createExplorerDataPort(localDataPort, filesVisibilitySettings) : null),
    [filesVisibilitySettings, localDataPort],
  );
  const editorWorkbench = useDesktopEditorWorkbench(workspace, dataPort?.resolveNode ?? null);
  const activeDocumentPath = editorWorkbench.activePath;
  const handleResourceMoved = useCallback(async (previousPath: string, nextPath: string) => {
    if (documentStorageIdentity) {
      await closeDocumentWorkingCopiesUnderResource(documentStorageIdentity, previousPath);
    }
    editorWorkbench.rebaseResource(previousPath, nextPath);
  }, [documentStorageIdentity, editorWorkbench]);
  const handleResourceDeleted = useCallback(async (path: string) => {
    if (documentStorageIdentity) {
      await closeDocumentWorkingCopiesUnderResource(documentStorageIdentity, path);
    }
    editorWorkbench.closeUnderResource(path);
  }, [documentStorageIdentity, editorWorkbench]);
  const [activeExplorerNode, setActiveExplorerNode] = useState<DataNode | null>(null);
  const activeExplorerPath = activeExplorerNode?.path ?? activeDocumentPath;
  const activateDataNode = useCallback((node: DataNode) => {
    setActiveExplorerNode(node);
    if (isDocumentDataNode(node)) editorWorkbench.openDocument(node);
  }, [editorWorkbench]);
  const [documentNavigationError, setDocumentNavigationError] = useState<string | null>(null);
  const documentNavigationRequestRef = useRef(0);
  const desktopViewNavigationRequestRef = useRef(0);
  const drainWorkspaceNavigation = useCallback(async (): Promise<boolean> => {
    try {
      await closeAllDocumentWorkingCopies("workspace-switch");
      setDocumentNavigationError(null);
      return true;
    } catch (error) {
      setDocumentNavigationError(error instanceof Error ? error.message : String(error));
      return false;
    }
  }, []);
  const switcherRef = useRef<HTMLDivElement>(null);
  const desktopTerminalEnabled = isDesktopTerminalEnabled({ terminalToolEnabled });
  const desktopAgentChatEnabled = isDesktopAgentChatEnabled({
    available: agentChatAvailable,
    optedIn: experimentalSettings.enableAgentChat,
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
  const refreshWorkspaceContent = useCallback((paths: readonly string[] | string | null = null) => {
    setWorkspaceRefreshToken((current) => ({
      sequence: current.sequence + 1,
      paths: typeof paths === "string" ? [paths] : paths,
    }));
  }, []);
  const git = useDesktopGitController({
    workspace,
    gitViewActive: activeView === "git",
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
  } = usePuppyoneConfig(workspace?.path ?? null);
  const workspaceKey = useMemo(() => workspace?.path ?? "no-workspace", [workspace?.path]);
  const desktopCloudApiBaseUrl = useMemo(() => getDesktopCloudApiBaseUrl(), []);
  const activeCloudSession = useMemo(
    () => isCloudSessionForApiBase(cloudSession, desktopCloudApiBaseUrl) ? cloudSession : null,
    [cloudSession, desktopCloudApiBaseUrl],
  );
  const latestAiEditRequest = useAiEditReviewRequest({
    aiEditAssistEnabled,
    onWorkspaceContentChanged: refreshWorkspaceContent,
    workspace,
  });
  const activeAiEditRequest = aiEditAssistEnabled ? latestAiEditRequest : null;
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
    onEnterDataView: enterDataView,
    onLocalWorkspaceContentChanged: refreshGitStatus,
    onWorkspaceContentChanged: refreshWorkspaceContent,
    onResourceDeleted: handleResourceDeleted,
    onResourceMoved: handleResourceMoved,
    onActivateNode: activateDataNode,
    setActiveExplorerNode,
    workspace,
  });

  useEffect(() => {
    if (
      (!cloudEnabled && activeView === "cloud")
      || (activeView === "plugins" && !experimentalSettings.enableViewerPlugins)
    ) {
      setActiveView("data");
      setActiveCloudSection("initialize");
    }
  }, [activeView, cloudEnabled, experimentalSettings.enableViewerPlugins]);

  useEffect(() => {
    if (!isSettingsSectionAvailable(activeSettingsSection, { cloudEnabled })) {
      setActiveSettingsSection("general");
    }
  }, [activeSettingsSection, cloudEnabled]);

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
    setGitOperationError(null);
    setGitOperationLoading(null);
    setActiveSettingsSection("general");
    setBranchSwitcherOpen(false);
    setActiveExplorerNode(null);
    resetDataNodeActions();
  }, [resetDataNodeActions, setBranchSwitcherOpen, setGitOperationError, setGitOperationLoading, workspace?.path]);

  const openWorkspaceSwitcherItem = useCallback((item: DesktopWorkspaceSwitcherItem) => {
    if (item.id === workspace?.id) {
      setSwitcherOpen(false);
      return;
    }

    void (async () => {
      if (!await drainWorkspaceNavigation()) return;
      await openWorkspaceTarget({
        kind: "local",
        path: item.workspace.path,
      }).then(handleWorkspaceOpenResult);
    })().catch((error) => {
      setRestoreWorkspaceError(error instanceof Error ? error.message : String(error));
    });
  }, [
    drainWorkspaceNavigation,
    handleWorkspaceOpenResult,
    setRestoreWorkspaceError,
    workspace?.id,
  ]);

  const cloudResolutionInputsLoading = shouldBlockWorkspaceCloudResolution({
    gitStatusError,
    gitStatusPath,
    workspacePath: workspace?.path ?? null,
  });

  const projectCloudContext = useCurrentRepositoryCloudContext({
    workspace,
    activeGitStatus,
    activeCloudSession,
    cloudEnabled,
    desktopCloudApiBaseUrl,
    resolutionInputsLoading: cloudResolutionInputsLoading,
    updateCloudSession,
  });
  const resolvedCloudProjectId = getResolvedCloudProjectId(projectCloudContext);

  const workspacePath = workspace?.path ?? null;
  const cloudHubWorkspaceIdentity = workspace
    ? `${workspace.id}:${workspace.path}`
    : null;
  const previousCloudHubWorkspaceIdentityRef = useRef<string | null>(null);
  useEffect(() => {
    const workspaceChanged = previousCloudHubWorkspaceIdentityRef.current !== cloudHubWorkspaceIdentity;
    previousCloudHubWorkspaceIdentityRef.current = cloudHubWorkspaceIdentity;
    if (!workspacePath) return;
    setActiveCloudSection((currentSection) => resolveCloudHubSectionAfterContextChange({
      currentSection,
      hasProjectContext: Boolean(resolvedCloudProjectId),
      workspaceChanged,
    }));
  }, [resolvedCloudProjectId, cloudHubWorkspaceIdentity, workspacePath]);

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
      await refreshRecentWorkspaceList();
    } catch (error) {
      setRestoreWorkspaceError(error instanceof Error ? error.message : String(error));
    }
  }, [
    clearWorkspace,
    drainWorkspaceNavigation,
    refreshRecentWorkspaceList,
    resetDataNodeActions,
    setBranchSwitcherOpen,
    setRestoreWorkspaceError,
    setRightSidebarOpen,
  ]);

  const navigateDesktopView = useCallback((view: DesktopView) => {
    const requestId = ++desktopViewNavigationRequestRef.current;
    const routesToData = (
      (view === "plugins" && !experimentalSettings.enableViewerPlugins)
      || (view === "cloud" && !cloudEnabled)
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

      if (view === "plugins" && !experimentalSettings.enableViewerPlugins) {
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

      if (view === "cloud") {
        setActiveView("cloud");
        setActiveCloudSection(
          resolvedCloudProjectId
            ? "contents"
            : "initialize",
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
    experimentalSettings.enableViewerPlugins,
    resolvedCloudProjectId,
    setSidebarCollapsed,
  ]);

  const handleActiveDataPathChange = useCallback(async (
    path: string | null,
    node: DataNode | null = null,
  ) => {
    const requestId = ++documentNavigationRequestRef.current;
    if (requestId !== documentNavigationRequestRef.current) return;
    setDocumentNavigationError(null);
    if (!path) {
      setActiveExplorerNode(null);
      return;
    }
    try {
      const resolvedNode = node ?? await dataPort?.resolveNode?.(path) ?? null;
      if (requestId !== documentNavigationRequestRef.current) return;
      if (!resolvedNode) {
        setDocumentNavigationError(`Unable to resolve workspace entry: ${path}`);
        return;
      }
      activateDataNode(resolvedNode);
    } catch (error) {
      if (requestId === documentNavigationRequestRef.current) {
        setDocumentNavigationError(error instanceof Error ? error.message : String(error));
      }
    }
  }, [activateDataNode, dataPort]);
  const handleEditorClose = useCallback(async (editorId: string) => {
    try {
      if (documentStorageIdentity) {
        await closeDocumentWorkingCopy({
          storageIdentity: documentStorageIdentity,
          resourcePath: editorId,
        });
      }
      editorWorkbench.close(editorId);
      setDocumentNavigationError(null);
    } catch (error) {
      setDocumentNavigationError(error instanceof Error ? error.message : String(error));
    }
  }, [documentStorageIdentity, editorWorkbench]);
  useEffect(() => {
    const handleEditorShortcut = (event: KeyboardEvent) => {
      if (activeView !== "data" || editorWorkbench.state.editors.length === 0) return;
      const platformModifier = event.metaKey || event.ctrlKey;
      if (platformModifier && !event.altKey && event.key.toLowerCase() === "w") {
        if (!editorWorkbench.activePath) return;
        event.preventDefault();
        void handleEditorClose(editorWorkbench.activePath);
        return;
      }
      if (event.ctrlKey && !event.metaKey && !event.altKey && event.key === "Tab") {
        event.preventDefault();
        const currentIndex = editorWorkbench.state.editors.findIndex(({ id }) => id === editorWorkbench.activePath);
        const offset = event.shiftKey ? -1 : 1;
        const nextIndex = (currentIndex + offset + editorWorkbench.state.editors.length) % editorWorkbench.state.editors.length;
        editorWorkbench.activate(editorWorkbench.state.editors[nextIndex]!.id);
        return;
      }
    };
    window.addEventListener("keydown", handleEditorShortcut, true);
    return () => window.removeEventListener("keydown", handleEditorShortcut, true);
  }, [activeView, editorWorkbench, handleEditorClose]);
  const handleActiveDataNodeChange = useCallback((node: DataNode | null) => {
    setActiveExplorerNode((current) => (
      hasSameActiveDataNodeIdentity(current, node) ? current : node
    ));
  }, []);

  const handleFilesVisibilitySettingsChange = useCallback((nextSettings: FilesVisibilitySettings) => {
    setFilesVisibilitySettings(nextSettings);
    refreshWorkspaceContent();
  }, [refreshWorkspaceContent, setFilesVisibilitySettings]);

  const handlePuppyoneConfigChange = useCallback(async (nextConfig: PuppyoneWorkspaceConfig) => {
    const savedConfig = await savePuppyoneConfig(nextConfig);
    if (savedConfig) {
      refreshWorkspaceContent();
      await refreshGitStatus("configuration");
    }
    return savedConfig;
  }, [refreshGitStatus, refreshWorkspaceContent, savePuppyoneConfig]);

  const [workspaceSurfaceError, setWorkspaceSurfaceError] = useState<string | null>(null);

  const closeSwitcher = useCallback(() => {
    setSwitcherOpen(false);
  }, []);
  const externalFileOpen = useExternalFileOpen({
    onActionSettled: closeSwitcher,
    onError: setWorkspaceSurfaceError,
    workspace,
  });

  const handleCloudSessionChange = useCallback((session: DesktopCloudSession | null) => {
    if (!cloudEnabled) return;

    updateCloudSession(session);
    if (!session) {
      if (activeView === "settings") {
        setActiveSettingsSection("account");
        return;
      }
      setActiveView("cloud");
      setActiveCloudSection("initialize");
      setSidebarCollapsed(false);
      setSwitcherOpen(false);
    }
  }, [activeView, cloudEnabled, setSidebarCollapsed, updateCloudSession]);

  const handleRemoveCloudRemote = useCallback(async () => {
    if (!workspace) return;
    const refreshedStatus = await removeWorkspaceGitRemote(workspace.path, "puppyone");
    const currentConfig = puppyoneConfig
      ?? await readPuppyoneWorkspaceConfig(workspace.path);
    const configReferencesPuppyone = currentConfig.sync.sourceOfTruth.service === "puppyone"
      || currentConfig.sync.sourceOfTruth.remote === "puppyone"
      || currentConfig.backup.service === "puppyone"
      || currentConfig.backup.remote === "puppyone"
      || currentConfig.git.primaryRemote === "puppyone";
    // Initialize and Push intentionally keeps Cloud identity in Git. If this
    // workspace never opted into legacy sync preferences, removing the remote
    // must not create a new `.puppyone/config.json` file as a side effect.
    if (configReferencesPuppyone) {
      const nextConfig = mergePuppyoneWorkspaceConfig(currentConfig, {
        sync: {
          sourceOfTruth: { service: "github", remote: null, branch: null },
        },
        backup: {
          enabled: false,
          service: "github",
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
    }
    const context = captureGitRepositoryContext(workspace.path);
    if (context && applyGitStatus(
      refreshedStatus,
      context,
      createRepositoryRefreshReason("configure-remote", "mutation"),
    )) {
      refreshWorkspaceContent();
    }
    setActiveCloudSection("initialize");
  }, [
    applyGitStatus,
    captureGitRepositoryContext,
    handlePuppyoneConfigChange,
    puppyoneConfig,
    refreshWorkspaceContent,
    workspace,
  ]);

  const {
    cloudInitializationLoading: cloudBackupLoading,
    cloudInitializationError: cloudPublishError,
    cloudInitializationNotice: cloudPublishNotice,
    cloudInitializationProgress: cloudPublishProgress,
    cloudInitializationState: cloudPublishState,
    cloudInitializationStateLoading: cloudPublishStateLoading,
    handleCleanupCloudInitialization: handleAbandonPuppyoneBackup,
    handleStartCloudInitialization: handleStartPuppyoneBackup,
    cloudInitializationPending: pendingCloudBackupSetup,
  } = useCloudInitialization({
    activeCloudSession,
    applyGitStatus,
    captureGitRepositoryContext,
    clearGitSelection,
    cloudEnabled,
    desktopCloudApiBaseUrl,
    isGitRepositoryContextCurrent,
    refreshWorkspaceContent,
    setActiveCloudSection,
    setActiveView,
    setSidebarCollapsed,
    setSwitcherOpen,
    workspace,
  });

  const unlinkCurrentWorkspace = useCallback(async () => {
    if (!await drainWorkspaceNavigation()) return;
    await forgetActiveWorkspace();
    setSwitcherOpen(false);
    setBranchSwitcherOpen(false);
    setRightSidebarOpen(false);
    resetDataNodeActions();
  }, [
    drainWorkspaceNavigation,
    forgetActiveWorkspace,
    resetDataNodeActions,
    setBranchSwitcherOpen,
    setRightSidebarOpen,
  ]);

  const toggleWorkspaceSwitcher = useCallback(() => {
    const nextOpen = !switcherOpen;
    setSwitcherOpen(nextOpen);
    setBranchSwitcherOpen(false);
  }, [setBranchSwitcherOpen, switcherOpen]);

  const toggleBranchSwitcher = useCallback(() => {
    setBranchSwitcherOpen((open) => !open);
    setSwitcherOpen(false);
  }, [setBranchSwitcherOpen]);

  const closeBranchSwitcher = useCallback(() => {
    setBranchSwitcherOpen(false);
  }, [setBranchSwitcherOpen]);

  const closeWorkspaceSwitcher = useCallback(() => {
    setSwitcherOpen(false);
  }, []);

  const handleLocationBarNavigate = useCallback(async (displayPath: string) => {
    if (!workspace) return;
    navigateDesktopView("data");
    const entryPath = resolveDesktopShellWorkspaceEntryPath(displayPath, workspace.path);
    if (entryPath === undefined || entryPath === null || !dataPort) {
      if (entryPath === null) setActiveExplorerNode(null);
      return;
    }

    try {
      const node = await dataPort.resolveNode?.(entryPath) ?? null;
      if (node) await handleActiveDataPathChange(node.path, node);
    } catch {
      // The workspace surface already owns filesystem error presentation. An
      // invalid address remains editable so the user can correct it in place.
    }
  }, [dataPort, handleActiveDataPathChange, navigateDesktopView, workspace]);

  if (restoringWorkspace && !workspace) {
    return (
      <RestoringWorkspaceScreen
        themeMode={activeThemeMode}
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
      <Homepage
        onChooseWorkspace={openFolder}
        onChooseProjectLocation={chooseProjectLocation}
        onCreateProject={createProject}
        onCloneRepository={cloneRepository}
        onOpenDroppedWorkspace={openDroppedWorkspace}
        onOpenWorkspacePath={openWorkspacePath}
        onRemoveProject={removeWorkspaceFromRecents}
        recentWorkspaces={recentWorkspaceItems}
        initialError={restoreWorkspaceError}
        cornerSlot={(
          <DesktopHelpLauncher
            theme={resolvedTheme}
            lightThemePreset={lightThemePreset}
            darkThemePreset={darkThemePreset}
            textSize={textSize}
            typography={typography}
            pointerCursors={pointerCursors}
            diffMarkers={diffMarkers}
          />
        )}
        themeMode={activeThemeMode}
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

  const workspaceSwitcherItems = getWorkspaceSwitcherItems({ workspaces });
  const titlebarSidebarSlot = (
    <DesktopTitlebarContext
      activeGitStatus={activeGitStatus}
      branchSwitcherOpen={branchSwitcherOpen}
      branchSwitcherRef={branchSwitcherRef}
      gitStatusLoading={gitStatusLoading}
      gitOperationLoading={gitOperationLoading}
      localBranches={localBranches}
      remoteBranches={remoteBranches}
      workspace={workspace}
      workspaceSwitcherItems={workspaceSwitcherItems}
      workspaceSwitcherOpen={switcherOpen}
      workspaceSwitcherRef={switcherRef}
      onCheckoutBranch={handleCheckoutGitBranch}
      onGoHome={() => void goToHomepage()}
      onCloseWorkspaceSwitcher={closeWorkspaceSwitcher}
      onOpenFolder={openFolder}
      onOpenWorkspaceSwitcherItem={openWorkspaceSwitcherItem}
      onCloseBranchSwitcher={closeBranchSwitcher}
      onToggleBranchSwitcher={toggleBranchSwitcher}
      onToggleWorkspaceSwitcher={toggleWorkspaceSwitcher}
    />
  );

  const toolsInNavigationToolbar = resolvedAppearance.composition.navigation === "sidebar-top-toolbar";
  const locationBarVisible = resolvedAppearance.composition.locationBar === "workspace-path-v1";
  const locationBarPath = resolveDesktopShellLocationPath({
    // The address bar describes the content surface. Keep the active editor
    // authoritative even if explorer selection state is briefly catching up.
    activePath: activeDocumentPath ?? activeExplorerNode?.path ?? null,
    dataViewActive: activeView === "data",
    workspacePath: workspace.path,
  });
  const chromeActionProps = {
    desktopUpdateState: desktopUpdates.state,
    titlebarActionsSettings,
    terminalSidebarOpen: rightSidebarOpen && desktopTerminalEnabled && rightSidebarSurface === "terminal",
    terminalToolEnabled: desktopTerminalEnabled,
    agentChatEnabled: desktopAgentChatEnabled,
    agentChatSidebarOpen: rightSidebarOpen && desktopAgentChatEnabled && rightSidebarSurface === "chat",
    onUpdateNow: () => void desktopUpdates.updateNow(),
    onToggleTerminal: () => {
      const terminalIsOpen = rightSidebarOpen && rightSidebarSurface === "terminal";
      setRightSidebarSurface("terminal");
      setRightSidebarOpen(!terminalIsOpen);
      setSwitcherOpen(false);
    },
    onToggleAgentChat: () => {
      if (!desktopAgentChatEnabled) return;
      const chatIsOpen = rightSidebarOpen && rightSidebarSurface === "chat";
      setRightSidebarSurface("chat");
      setRightSidebarOpen(!chatIsOpen);
      setSwitcherOpen(false);
    },
  };
  const titlebarActions = (
    <DesktopTitlebarActions
      {...chromeActionProps}
      visibleGroups={toolsInNavigationToolbar ? ["app-status", "header"] : undefined}
    />
  );
  const navigationToolbarActions = toolsInNavigationToolbar && desktopRightSidebarEnabled ? (
    <DesktopTitlebarActions
      {...chromeActionProps}
      placement="toolbar"
      visibleGroups={["right-sidebar"]}
    />
  ) : undefined;

  return (
    <div
      className={`app-shell cloud-runtime ${resolvedTheme === "dark" ? "dark" : ""}`}
      data-theme-mode={activeThemeMode}
      data-interface-style={interfaceStyle}
      data-interface-style-family={resolvedAppearance.profile.family}
      data-interface-style-variant={resolvedAppearance.profile.variant}
      data-interface-style-palette={resolvedAppearance.profile.palette}
      data-appearance-token-set={resolvedAppearance.tokenSet}
      data-shell-composition={resolvedAppearance.composition.shell}
      data-titlebar-composition={resolvedAppearance.composition.titlebar}
      data-navigation-composition={resolvedAppearance.composition.navigation}
      data-location-bar-composition={resolvedAppearance.composition.locationBar}
      data-scrollbar-composition={resolvedAppearance.composition.scrollbar}
      data-icon-pack={resolvedAppearance.composition.iconPack}
      data-light-theme-preset={lightThemePreset}
      data-dark-theme-preset={darkThemePreset}
      data-text-size={textSize}
      data-interface-text-size={textSize}
      data-content-text-size={textSize}
      data-terminal-text-size={textSize}
      data-pointer-cursors={pointerCursors ? "true" : "false"}
      data-diff-markers={diffMarkers}
      {...typographyRootProps}
    >
      <DesktopCloudShell
          leftSidebarCollapsed={sidebarCollapsed}
          leftSidebarPresent={Boolean(dataPort)}
          leftSidebarWidth={explorerWidth}
          titlebarSidebarSlot={titlebarSidebarSlot}
          titlebarActions={titlebarActions}
          navigationToolbarActions={navigationToolbarActions}
          locationBar={locationBarVisible ? (
            <DesktopShellLocationBar
              path={locationBarPath}
              onNavigate={handleLocationBarNavigate}
            />
          ) : undefined}
          rightSidebarOpen={rightSidebarOpen && desktopRightSidebarEnabled}
          resizableRightSidebar
          rightSidebarWidth={rightSidebarWidth}
          onLeftSidebarExpand={() => setSidebarCollapsed(false)}
          onRightSidebarOpenChange={setRightSidebarOpen}
          onRightSidebarWidthChange={setRightSidebarWidth}
          rightSidebar={desktopRightSidebarEnabled ? (
          <div className="desktop-right-sidebar-stack" key={workspace.path}>
            {desktopTerminalEnabled && (
              <div
                className={`desktop-right-sidebar-surface ${rightSidebarSurface === "terminal" ? "is-active" : ""}`}
                aria-hidden={rightSidebarSurface !== "terminal"}
              >
                <RightTerminalPanel
                  workspace={workspace}
                  active={rightSidebarOpen && rightSidebarSurface === "terminal"}
                  hiddenAgentIds={localAgentsSettings.hiddenTerminalAgentIds}
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
          activeDocumentPath={activeDocumentPath}
          activeExplorerPath={activeExplorerPath}
          activeView={activeView}
          cloud={{
            activeSection: activeCloudSection,
            projectContext: projectCloudContext,
            backupLoading: cloudBackupLoading,
            backupPending: pendingCloudBackupSetup,
            publishError: cloudPublishError,
            publishNotice: cloudPublishNotice,
            publishProgress: cloudPublishProgress,
            publishState: cloudPublishState,
            publishStateLoading: cloudPublishStateLoading,
            cloudApiBaseUrl: desktopCloudApiBaseUrl,
            storedCloudSession: cloudSession,
            enabled: cloudEnabled,
            sessionRestoring: cloudSessionRestoring,
            onCloudSessionChange: handleCloudSessionChange,
            onAbandonPuppyoneBackup: handleAbandonPuppyoneBackup,
            onRemoveCloudRemote: handleRemoveCloudRemote,
            onOpenGitSettings: () => {
              setActiveSettingsSection("git");
              navigateDesktopView("settings");
            },
            onSelectSection: setActiveCloudSection,
            onStartPuppyoneBackup: handleStartPuppyoneBackup,
          }}
          dataPort={dataPort}
          editorWorkbench={editorWorkbench}
          externalOpen={externalFileOpen}
          desktopUpdates={desktopUpdates}
          git={git}
          navigationComposition={resolvedAppearance.composition.navigation}
          onActiveDataNodeChange={handleActiveDataNodeChange}
          onActiveDataPathChange={handleActiveDataPathChange}
          onResourceMove={handleResourceMoved}
          onCreateEntryMenu={openCreateEntryMenu}
          onDismissCreateEntryMenu={() => setCreateEntryDraft(null)}
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
          workspaceSurfaceError={documentNavigationError ?? workspaceSurfaceError}
          workspaceKey={workspaceKey}
          workspaceRefreshToken={workspaceRefreshToken}
          sidebarCreateMenuOpen={Boolean(
            createEntryDraft
            && !createEntryDraft.selectedKind
            && createEntryDraft.anchor.placement === "auto-end"
          )}
        />
        <DesktopHelpLauncher
          theme={resolvedTheme}
          lightThemePreset={lightThemePreset}
          darkThemePreset={darkThemePreset}
          textSize={textSize}
          typography={typography}
          pointerCursors={pointerCursors}
          diffMarkers={diffMarkers}
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
              onPull={() => {
                dismissGitOperationError();
                void handlePullGit();
              }}
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
                mainEntries={createNewItems.main}
                submenuItemKinds={createNewItems.submenu}
                fileIconTheme={fileIconTheme}
                onCancel={() => setCreateEntryDraft(null)}
                onSelectKind={selectCreateEntryKind}
              />
            )
          )}
          {nodeActionMenu && (
            <DesktopNodeActionMenu
              draft={nodeActionMenu}
              experimentalSettings={preferences.experimentalSettings}
              showRevealInFinder
              showOpenInDefaultApp
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
