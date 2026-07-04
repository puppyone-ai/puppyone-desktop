import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type AiEditRequest, type Workspace } from "@puppyone/shared-ui";
import { DesktopCloudShell, type DesktopView } from "./components/DesktopCloudShell";
import type { SettingsSection } from "./features/settings";
import {
  CloudServicePanel,
  resolveMappedCloudProjectId,
  type CloudWorkspaceSection,
} from "./features/cloud";
import {
  MinimalOnboarding,
  type OnboardingOperationStatus,
  type ProjectHomeItem,
  type RecentWorkspaceHomeItem,
} from "./components/MinimalOnboarding";
import { RightTerminalPanel } from "./components/RightTerminalPanel";
import { useDesktopUpdates } from "./components/DesktopUpdateControls";
import {
  commitWorkspaceGit,
  configureWorkspaceCloudRemote,
  createLocalDataPort,
  forgetLastWorkspace,
  getInitialWorkspace,
  getLatestAiEditReviewRequest,
  getRecentWorkspaces,
  getWorkspaceGitStatus,
  initializeWorkspaceGitRepository,
  openWorkspaceInCurrentWindow,
  pushWorkspaceGit,
  readPuppyoneWorkspaceConfig,
  selectWorkspaceFolder,
  selectWorkspaceFolderInNewWindow,
  showHomepage,
  stageAllWorkspaceGitChanges,
  subscribeAiEditReviewUpdates,
} from "./lib/localFiles";
import {
  createCloudProject,
  getDesktopCloudApiBaseUrl,
  getCloudProject,
  getCloudRepoIdentity,
  isCloudSessionForApiBase,
  listCloudProjects,
  type DesktopCloudProject,
  type DesktopCloudSession,
} from "./lib/cloudApi";
import {
  createCloudDataPort,
  createCloudWorkspace,
  getCloudProjectIdFromWorkspace,
  isCloudWorkspace,
} from "./lib/cloudDataPort";
import type { FilesVisibilitySettings } from "./preferences";
import type { PuppyoneWorkspaceConfig, WorkspaceOpenResult } from "./types/electron";
import { ChevronDown } from "lucide-react";
import { PuppyGitIcon } from "./features/app-shell/navigation";
import {
  MAX_RIGHT_SIDEBAR_WIDTH,
  MIN_RIGHT_SIDEBAR_WIDTH,
  TITLEBAR_BRANCH_LABEL_CHARS,
  TITLEBAR_WORKSPACE_LABEL_CHARS,
  mergePuppyoneWorkspaceConfig,
  shortenTitlebarLabel,
} from "./features/app-shell/preferences";
import { DesktopWorkspaceContent } from "./features/app-shell/DesktopWorkspaceContent";
import { DesktopTitlebarActions } from "./features/app-shell/DesktopTitlebarActions";
import { DesktopOverlayPortal } from "./features/app-shell/DesktopOverlayPortal";
import {
  DesktopWorkspaceSwitcher,
  type DesktopWorkspaceSwitcherItem,
} from "./features/app-shell/DesktopWorkspaceSwitcher";
import { RestoringWorkspaceScreen } from "./features/app-shell/RestoringWorkspaceScreen";
import { useDesktopPreferences } from "./features/app-shell/useDesktopPreferences";
import { usePuppyoneConfig } from "./features/app-shell/usePuppyoneConfig";
import { useDesktopCloudSession } from "./features/cloud/hooks/useDesktopCloudSession";
import { useFeatureFlag } from "./features/flags";
import {
  DesktopCreateEntryDialog,
  DesktopCreateEntryMenu,
  DesktopNodeActionMenu,
} from "./features/data-workspace/nodeActions";
import { createExplorerDataPort } from "./features/data-workspace/explorer";
import { useDataNodeActions } from "./features/data-workspace/useDataNodeActions";
import {
  BranchMenuGroup,
  BranchSwitchConflictDialog,
  GitOperationErrorDialog,
  createGitOperationErrorState,
} from "./features/source-control/operationDialogs";
import { useDesktopGitController } from "./features/source-control/useDesktopGitController";
import { getPuppyoneRemote } from "./features/source-control/remotes";

type RecentWorkspaceCloudBinding = {
  projectId: string | null;
  cloudLinked: boolean;
  error: string | null;
};

function mergeWorkspaceLists(current: Workspace[], incoming: Workspace[]) {
  const byId = new Map<string, Workspace>();
  for (const workspace of [...current, ...incoming]) {
    byId.set(workspace.id, workspace);
  }
  return Array.from(byId.values());
}

function getRecentWorkspaceItems(result: Awaited<ReturnType<typeof getRecentWorkspaces>>): RecentWorkspaceHomeItem[] {
  if (result.items) return result.items;
  return result.workspaces.map((workspace) => ({
    workspace,
    lastOpenedAt: null,
  }));
}

function getWorkspaceSwitcherItems({
  cloudProjects,
  includeCloud,
  workspaces,
}: {
  cloudProjects: DesktopCloudProject[];
  includeCloud: boolean;
  workspaces: Workspace[];
}): DesktopWorkspaceSwitcherItem[] {
  const cloudWorkspaces = includeCloud
    ? mergeWorkspaceLists(cloudProjects.map(createCloudWorkspace), workspaces.filter(isCloudWorkspace))
    : [];
  const localWorkspaces = workspaces.filter((item) => !isCloudWorkspace(item));

  return [
    ...cloudWorkspaces.map((workspace) => createWorkspaceSwitcherItem(workspace, "cloud")),
    ...localWorkspaces.map((workspace) => createWorkspaceSwitcherItem(workspace, "local")),
  ];
}

function getHomeProjectItems({
  bindings,
  cloudProjects,
  recentWorkspaceItems,
}: {
  bindings: Record<string, RecentWorkspaceCloudBinding>;
  cloudProjects: DesktopCloudProject[];
  recentWorkspaceItems: RecentWorkspaceHomeItem[];
}): ProjectHomeItem[] {
  const cloudProjectById = new Map(cloudProjects.map((project) => [project.id, project]));
  const consumedCloudProjectIds = new Set<string>();
  const items: ProjectHomeItem[] = [];

  for (const item of recentWorkspaceItems.slice(0, 20)) {
    const binding = bindings[item.workspace.id];
    const project = binding?.projectId ? cloudProjectById.get(binding.projectId) ?? null : null;
    if (project) consumedCloudProjectIds.add(project.id);

    const cloudLinked = Boolean(project || binding?.cloudLinked);
    items.push({
      id: project ? `cloud-local:${project.id}:${item.workspace.id}` : `local:${item.workspace.id}`,
      kind: project ? "cloud-local" : cloudLinked ? "cloud-linked" : "local",
      label: item.workspace.path,
      detail: project?.name ?? (cloudLinked ? "Cloud linked" : null),
      localPath: item.workspace.path,
      cloudProjectId: binding?.projectId ?? project?.id ?? null,
      description: project?.description ?? null,
      lastOpenedAt: item.lastOpenedAt ?? null,
      updatedAt: project?.updated_at ?? null,
    });
  }

  for (const project of cloudProjects.slice(0, 40)) {
    if (consumedCloudProjectIds.has(project.id)) continue;
    items.push({
      id: `cloud:${project.id}`,
      kind: "cloud",
      label: project.name || "Untitled Project",
      cloudProjectId: project.id,
      description: project.description ?? null,
      updatedAt: project.updated_at ?? null,
    });
  }

  return items;
}

async function resolveRecentWorkspaceCloudBinding({
  apiBaseUrl,
  item,
  onSessionChange,
  projects,
  session,
}: {
  apiBaseUrl: string | null;
  item: RecentWorkspaceHomeItem;
  onSessionChange: (session: DesktopCloudSession | null) => void;
  projects: DesktopCloudProject[];
  session: DesktopCloudSession | null;
}): Promise<[string, RecentWorkspaceCloudBinding]> {
  const rootPath = item.workspace.path;
  let configuredProjectId: string | null = null;
  let configError: string | null = null;
  try {
    const config = await readPuppyoneWorkspaceConfig(rootPath);
    configuredProjectId = config.cloud.projectId?.trim() || null;
  } catch (error) {
    configError = error instanceof Error ? error.message : String(error);
  }

  if (configuredProjectId) {
    return [item.workspace.id, {
      projectId: configuredProjectId,
      cloudLinked: true,
      error: configError,
    }];
  }

  const gitStatusResult = await getWorkspaceGitStatus(rootPath).catch(() => null);
  const cloudRemote = gitStatusResult ? getPuppyoneRemote(gitStatusResult) : null;

  if (!cloudRemote) {
    return [item.workspace.id, {
      projectId: null,
      cloudLinked: false,
      error: configError,
    }];
  }

  if (session) {
    try {
      const projectId = await resolveMappedCloudProjectId({
        session,
        projects,
        cloudRemote,
        configuredProjectId,
        onSessionChange,
        cloudApiBaseUrl: apiBaseUrl,
      });
      return [item.workspace.id, {
        projectId,
        cloudLinked: true,
        error: null,
      }];
    } catch (error) {
      return [item.workspace.id, {
        projectId: configuredProjectId,
        cloudLinked: true,
        error: error instanceof Error ? error.message : String(error),
      }];
    }
  }

  const remoteProjectId = cloudRemote.info.kind === "project"
    ? cloudRemote.info.projectId?.trim() || null
    : null;
  return [item.workspace.id, {
    projectId: remoteProjectId ?? configuredProjectId,
    cloudLinked: true,
    error: null,
  }];
}

function createWorkspaceSwitcherItem(
  workspace: Workspace,
  kind: DesktopWorkspaceSwitcherItem["kind"],
): DesktopWorkspaceSwitcherItem {
  const detail = kind === "cloud" ? "PuppyOne Cloud" : workspace.path;
  return {
    id: workspace.id,
    kind,
    label: workspace.name,
    detail,
    title: `${workspace.name} - ${detail}`,
    workspace,
  };
}

export function App() {
  const desktopUpdates = useDesktopUpdates();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [recentWorkspaceItems, setRecentWorkspaceItems] = useState<RecentWorkspaceHomeItem[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<DesktopView>("data");
  const preferences = useDesktopPreferences();
  const cloudEnabled = useFeatureFlag("cloudWorkspace");
  const {
    cloudSession,
    cloudSessionRestoring,
    handleCloudSessionChange: updateCloudSession,
  } = useDesktopCloudSession(cloudEnabled);
  const [activeCloudSection, setActiveCloudSection] = useState<CloudWorkspaceSection>("overview");
  const [pendingCloudBackupSetup, setPendingCloudBackupSetup] = useState(false);
  const [cloudBackupLoading, setCloudBackupLoading] = useState(false);
  const [cloudBackupError, setCloudBackupError] = useState<string | null>(null);
  const [homeCloudProjects, setHomeCloudProjects] = useState<DesktopCloudProject[]>([]);
  const [homeCloudProjectsLoading, setHomeCloudProjectsLoading] = useState(false);
  const [homeCloudProjectsError, setHomeCloudProjectsError] = useState<string | null>(null);
  const [recentWorkspaceCloudBindings, setRecentWorkspaceCloudBindings] = useState<Record<string, RecentWorkspaceCloudBinding>>({});
  const [cloudPanelOpen, setCloudPanelOpen] = useState(false);
  const [pendingCloudProjectCreate, setPendingCloudProjectCreate] = useState(false);
  const [homeOperationStatus, setHomeOperationStatus] = useState<OnboardingOperationStatus | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const showCloudSignInStatus = useCallback((detail: string) => {
    setHomeOperationStatus({
      title: "Sign in to Puppyone Cloud",
      detail,
    });
    window.setTimeout(() => {
      setHomeOperationStatus((current) => (
        current?.title === "Sign in to Puppyone Cloud" ? null : current
      ));
    }, 2200);
  }, []);
  const {
    aiEditAssistEnabled,
    fileIconTheme,
    filesVisibilitySettings,
    resolvedTheme,
    rightSidebarWidth,
    terminalSidebarOpen,
    terminalToolEnabled,
    themeMode,
    setFilesVisibilitySettings,
    setRightSidebarOpen,
    setRightSidebarWidth,
    setSidebarCollapsed,
  } = preferences;
  const [activeSettingsSection, setActiveSettingsSection] = useState<SettingsSection>("account");
  const [terminalResetToken, setTerminalResetToken] = useState(0);
  const [workspaceRefreshToken, setWorkspaceRefreshToken] = useState(0);
  const [latestAiEditRequest, setLatestAiEditRequest] = useState<AiEditRequest | null>(null);
  const [activeDataPath, setActiveDataPath] = useState<string | null>(null);
  const [restoringWorkspace, setRestoringWorkspace] = useState(true);
  const [restoreWorkspaceError, setRestoreWorkspaceError] = useState<string | null>(null);
  const switcherRef = useRef<HTMLDivElement>(null);
  const workspacePathRef = useRef<string | null>(null);

  const workspace = useMemo(
    () => activeWorkspaceId ? workspaces.find((item) => item.id === activeWorkspaceId) ?? null : null,
    [activeWorkspaceId, workspaces],
  );
  const workspaceIsCloud = isCloudWorkspace(workspace);
  const cloudProjectId = getCloudProjectIdFromWorkspace(workspace);
  useEffect(() => {
    if (workspace && homeOperationStatus) setHomeOperationStatus(null);
  }, [homeOperationStatus, workspace]);
  const handleCloudDataSessionChange = useCallback((session: DesktopCloudSession | null) => {
    updateCloudSession(session);
    if (!session) {
      setActiveView("data");
      setCloudPanelOpen(true); // prompt re-auth via the email/password cloud panel
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
    gitOperationError,
    gitOperationLoading,
    gitStatusLoading,
    localBranches,
    pendingBranchSwitch,
    remoteBranches,
    applyGitStatus,
    clearGitSelection,
    dismissGitOperationError,
    handleCheckoutGitBranch,
    handleCommitAndCheckoutBranch,
    handleStashAndCheckoutBranch,
    refreshGitStatus,
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
      workspaceIsCloud && cloudProjectId && activeCloudSession
        ? createCloudDataPort({
            projectId: cloudProjectId,
            session: activeCloudSession,
            onSessionChange: handleCloudDataSessionChange,
          })
        : null
    ),
    [activeCloudSession, cloudProjectId, handleCloudDataSessionChange, workspaceIsCloud],
  );
  const dataPort = useMemo(
    () => {
      const baseDataPort = workspaceIsCloud ? cloudDataPort : localDataPort;
      return baseDataPort ? createExplorerDataPort(baseDataPort, filesVisibilitySettings) : null;
    },
    [cloudDataPort, filesVisibilitySettings, localDataPort, workspaceIsCloud],
  );
  const {
    createEntryDraft,
    setCreateEntryDraft,
    nodeActionMenu,
    setNodeActionMenu,
    openCreateEntryMenu,
    openNodeActionMenu,
    selectCreateEntryKind,
    createEntryFromMenu,
    renameNodeFromMenu,
    deleteNodeFromMenu,
    revealNodeInFinderFromMenu,
  } = useDataNodeActions({
    dataPort,
    workspace,
    workspaceIsCloud,
    refreshGitStatus,
    setActiveView,
    setSidebarCollapsed,
    setSwitcherOpen,
    setBranchSwitcherOpen,
    setActiveDataPath,
    bumpWorkspaceRefreshToken: refreshWorkspaceContent,
  });
  const activeAiEditRequest = aiEditAssistEnabled ? latestAiEditRequest : null;
  const cloudWorkspaceAvailable = useMemo(() => Boolean(activeCloudSession), [activeCloudSession]);

  useEffect(() => {
    if (
      (!cloudEnabled && (activeView === "cloud" || activeView === "access" || activeView === "integrations")) ||
      (!workspaceIsCloud && (activeView === "access" || activeView === "integrations"))
    ) {
      setActiveView("data");
      setActiveCloudSection("overview");
      setPendingCloudBackupSetup(false);
      setCloudBackupLoading(false);
      setCloudBackupError(null);
    }
  }, [activeView, cloudEnabled, workspaceIsCloud]);

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
  }, [branchSwitcherOpen, switcherOpen]);

  useEffect(() => {
    workspacePathRef.current = workspace?.path ?? null;
    setGitOperationError(null);
    setGitOperationLoading(null);
    setPendingCloudBackupSetup(false);
    setCloudBackupLoading(false);
    setCloudBackupError(null);
    setActiveSettingsSection("workspace");
    setBranchSwitcherOpen(false);
    setLatestAiEditRequest(null);
    setActiveDataPath(null);
    setCreateEntryDraft(null);
    setNodeActionMenu(null);
  }, [workspace?.path]);

  const activateWorkspace = useCallback((nextWorkspace: Workspace) => {
    setWorkspaces((current) => {
      const withoutExisting = current.filter((item) => item.id !== nextWorkspace.id);
      return [nextWorkspace, ...withoutExisting];
    });
    setActiveWorkspaceId(nextWorkspace.id);
    setActiveView("data");
    setSwitcherOpen(false);
    setRestoreWorkspaceError(null);
    setHomeOperationStatus(null);
  }, []);

  const refreshRecentWorkspaceList = useCallback(async () => {
    const result = await getRecentWorkspaces();
    setRecentWorkspaceItems(getRecentWorkspaceItems(result));
    setWorkspaces((current) => mergeWorkspaceLists(current, result.workspaces));
    if (result.errors.length > 0) {
      console.warn("Some recent puppyone workspaces could not be loaded:", result.errors);
    }
  }, []);

  const refreshHomeCloudProjects = useCallback(async () => {
    if (!cloudEnabled || !activeCloudSession) {
      setHomeCloudProjects([]);
      setHomeCloudProjectsLoading(false);
      setHomeCloudProjectsError(null);
      return;
    }

    setHomeCloudProjectsLoading(true);
    setHomeCloudProjectsError(null);
    try {
      const projects = await listCloudProjects(activeCloudSession, updateCloudSession);
      setHomeCloudProjects(projects);
    } catch (error) {
      setHomeCloudProjectsError(error instanceof Error ? error.message : String(error));
    } finally {
      setHomeCloudProjectsLoading(false);
    }
  }, [activeCloudSession, cloudEnabled, updateCloudSession]);

  const recentWorkspaceBindingKey = useMemo(
    () => recentWorkspaceItems
      .slice(0, 20)
      .map((item) => `${item.workspace.id}\t${item.workspace.path}\t${item.lastOpenedAt ?? ""}`)
      .join("\n"),
    [recentWorkspaceItems],
  );
  const homeCloudProjectIdsKey = useMemo(
    () => homeCloudProjects.map((project) => project.id).join("\n"),
    [homeCloudProjects],
  );

  useEffect(() => {
    const items = recentWorkspaceItems.slice(0, 20);
    if (!cloudEnabled || items.length === 0) {
      setRecentWorkspaceCloudBindings({});
      return undefined;
    }

    let cancelled = false;
    void Promise.all(
      items.map((item) => resolveRecentWorkspaceCloudBinding({
        apiBaseUrl: desktopCloudApiBaseUrl,
        item,
        onSessionChange: updateCloudSession,
        projects: homeCloudProjects,
        session: activeCloudSession,
      })),
    )
      .then((entries) => {
        if (cancelled) return;
        setRecentWorkspaceCloudBindings(Object.fromEntries(entries));
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn("Unable to resolve recent workspace Cloud bindings:", error);
          setRecentWorkspaceCloudBindings({});
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeCloudSession,
    cloudEnabled,
    desktopCloudApiBaseUrl,
    homeCloudProjectIdsKey,
    recentWorkspaceBindingKey,
    recentWorkspaceItems,
    updateCloudSession,
  ]);

  const homeProjectItems = useMemo(
    () => getHomeProjectItems({
      bindings: recentWorkspaceCloudBindings,
      cloudProjects: homeCloudProjects,
      recentWorkspaceItems,
    }),
    [homeCloudProjects, recentWorkspaceCloudBindings, recentWorkspaceItems],
  );

  const handleWorkspaceOpenResult = useCallback((result: WorkspaceOpenResult | null) => {
    if (!result) return;
    if (result.status === "opened-current" && result.workspace) {
      activateWorkspace(result.workspace);
    } else {
      setSwitcherOpen(false);
      setRestoreWorkspaceError(null);
    }
    void refreshRecentWorkspaceList().catch((error) => {
      console.warn("Unable to refresh recent puppyone workspaces:", error);
    });
  }, [activateWorkspace, refreshRecentWorkspaceList]);

  const openWorkspaceSwitcherItem = useCallback((item: DesktopWorkspaceSwitcherItem) => {
    if (item.kind === "cloud") {
      activateWorkspace(item.workspace);
      return;
    }

    void openWorkspaceInCurrentWindow(item.workspace.path)
      .then(handleWorkspaceOpenResult)
      .catch((error) => {
        setRestoreWorkspaceError(error instanceof Error ? error.message : String(error));
      });
  }, [activateWorkspace, handleWorkspaceOpenResult]);

  const openWorkspacePath = useCallback(async (folderPath: string) => {
    const result = await openWorkspaceInCurrentWindow(folderPath);
    handleWorkspaceOpenResult(result);
  }, [handleWorkspaceOpenResult]);

  const goToHomepage = useCallback(async () => {
    try {
      await showHomepage();
      setActiveWorkspaceId(null);
      setActiveView("data");
      setSwitcherOpen(false);
      setBranchSwitcherOpen(false);
      setRightSidebarOpen(false);
      setCreateEntryDraft(null);
      setNodeActionMenu(null);
      setRestoreWorkspaceError(null);
      setHomeOperationStatus(null);
      await Promise.all([
        refreshRecentWorkspaceList(),
        refreshHomeCloudProjects(),
      ]);
    } catch (error) {
      setRestoreWorkspaceError(error instanceof Error ? error.message : String(error));
    }
  }, [refreshHomeCloudProjects, refreshRecentWorkspaceList]);

  const navigateDesktopView = useCallback((view: DesktopView) => {
    if (workspaceIsCloud && (view === "git" || view === "cloud")) {
      setActiveView("data");
      setSidebarCollapsed(false);
      setSwitcherOpen(false);
      return;
    }

    if (!workspaceIsCloud && (view === "access" || view === "integrations")) {
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

    if ((view === "access" || view === "integrations") && !cloudEnabled) {
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
    }

    setActiveView(view);
    setSidebarCollapsed(false);
    setSwitcherOpen(false);
  }, [cloudEnabled, cloudSessionRestoring, cloudWorkspaceAvailable, workspaceIsCloud]);

  const handleActiveDataPathChange = useCallback((path: string | null) => {
    setActiveDataPath(path);
  }, []);

  const handleFilesVisibilitySettingsChange = useCallback((nextSettings: FilesVisibilitySettings) => {
    setFilesVisibilitySettings(nextSettings);
    setWorkspaceRefreshToken((token) => token + 1);
  }, []);

  const handlePuppyoneConfigChange = useCallback(async (nextConfig: PuppyoneWorkspaceConfig) => {
    const savedConfig = await savePuppyoneConfig(nextConfig);
    if (savedConfig) {
      setWorkspaceRefreshToken((token) => token + 1);
      await refreshGitStatus();
    }
    return savedConfig;
  }, [refreshGitStatus, savePuppyoneConfig]);

  useEffect(() => {
    let cancelled = false;

    Promise.all([getInitialWorkspace(), getRecentWorkspaces()])
      .then(([initialWorkspace, recentWorkspaces]) => {
        if (cancelled) return;
        setRecentWorkspaceItems(getRecentWorkspaceItems(recentWorkspaces));
        setWorkspaces((current) => mergeWorkspaceLists(current, recentWorkspaces.workspaces));
        if (recentWorkspaces.errors.length > 0) {
          console.warn("Some recent puppyone workspaces could not be loaded:", recentWorkspaces.errors);
        }
        if (initialWorkspace.workspace) {
          activateWorkspace(initialWorkspace.workspace);
        } else if (initialWorkspace.error) {
          setRestoreWorkspaceError(initialWorkspace.error);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setRestoreWorkspaceError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled) setRestoringWorkspace(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activateWorkspace]);

  useEffect(() => {
    void refreshHomeCloudProjects();
  }, [refreshHomeCloudProjects]);

  const openFolder = async () => {
    try {
      const result = workspace
        ? await selectWorkspaceFolderInNewWindow()
        : await selectWorkspaceFolder();
      handleWorkspaceOpenResult(result);
    } catch (error) {
      setRestoreWorkspaceError(error instanceof Error ? error.message : String(error));
    } finally {
      setSwitcherOpen(false);
    }
  };

  const activateCreatedCloudProject = useCallback(async (session: DesktopCloudSession) => {
    setHomeOperationStatus({
      title: "Creating cloud project",
      detail: "Preparing a new Puppyone Cloud workspace.",
    });
    const project = await createCloudProject(session, "Untitled Project", updateCloudSession);
    setHomeOperationStatus({
      title: "Opening cloud project",
      detail: "Loading the new workspace.",
    });
    setHomeCloudProjects((current) => [project, ...current.filter((item) => item.id !== project.id)]);
    activateWorkspace(createCloudWorkspace(project));
  }, [activateWorkspace, updateCloudSession]);

  const createCloudProjectFromHomepage = useCallback(async () => {
    if (!activeCloudSession) {
      setPendingCloudProjectCreate(true);
      showCloudSignInStatus("Sign in to Puppyone Cloud, then this project will be created.");
      setCloudPanelOpen(true);
      return;
    }
    setPendingCloudProjectCreate(false);
    try {
      await activateCreatedCloudProject(activeCloudSession);
    } catch (error) {
      setHomeOperationStatus(null);
      throw error;
    }
  }, [activateCreatedCloudProject, activeCloudSession, showCloudSignInStatus]);

  useEffect(() => {
    if (!pendingCloudProjectCreate || !activeCloudSession) return undefined;

    let cancelled = false;
    setPendingCloudProjectCreate(false);
    setCloudPanelOpen(false);
    void activateCreatedCloudProject(activeCloudSession).catch((error) => {
      if (!cancelled) {
        setHomeOperationStatus(null);
        setRestoreWorkspaceError(error instanceof Error ? error.message : String(error));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activateCreatedCloudProject, activeCloudSession, pendingCloudProjectCreate]);

  const openCloudProjectFromHomepage = useCallback(async (projectId: string) => {
    if (!activeCloudSession) {
      showCloudSignInStatus("Sign in to Puppyone Cloud, then open this project again.");
      setCloudPanelOpen(true);
      return;
    }

    setHomeOperationStatus({
      title: "Opening cloud project",
      detail: "Loading the project workspace.",
    });
    try {
      const project = homeCloudProjects.find((item) => item.id === projectId)
        ?? await getCloudProject(activeCloudSession, projectId, updateCloudSession);
      activateWorkspace(createCloudWorkspace(project));
    } catch (error) {
      setHomeOperationStatus(null);
      throw error;
    }
  }, [activateWorkspace, activeCloudSession, homeCloudProjects, showCloudSignInStatus, updateCloudSession]);

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
      if (workspaceIsCloud) setCloudPanelOpen(true);
    }
  }, [activeView, cloudEnabled, updateCloudSession, workspaceIsCloud]);

  const handleConfigureCloudRemote = useCallback(async (remoteUrl: string) => {
    if (!cloudEnabled) return null;
    if (!workspace) return null;
    if (workspaceIsCloud) return null;
    await configureWorkspaceCloudRemote(workspace.path, remoteUrl, "puppyone");
    const nextConfig = mergePuppyoneWorkspaceConfig(puppyoneConfig, {
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
    await handlePuppyoneConfigChange(nextConfig);
    const refreshedStatus = await getWorkspaceGitStatus(workspace.path);
    applyGitStatus(refreshedStatus, workspace.path);
    refreshWorkspaceContent();
    return refreshedStatus;
  }, [applyGitStatus, cloudEnabled, handlePuppyoneConfigChange, puppyoneConfig, refreshWorkspaceContent, workspace, workspaceIsCloud]);

  const createPuppyoneCloudBackup = useCallback(async (session: DesktopCloudSession) => {
    if (!cloudEnabled) return false;
    if (!workspace) return false;
    if (workspaceIsCloud) return false;

    setCloudBackupLoading(true);
    setCloudBackupError(null);
    setGitOperationLoading("cloud-backup");
    setGitOperationError(null);

    try {
      let nextStatus = activeGitStatus;
      if (!nextStatus) {
        nextStatus = await getWorkspaceGitStatus(workspace.path);
      }

      if (!nextStatus.isRepo) {
        nextStatus = await initializeWorkspaceGitRepository(workspace.path);
      }

      const localChangeCount =
        nextStatus.stagedEntries.length +
        nextStatus.unstagedEntries.length +
        nextStatus.untrackedEntries.length;

      if (localChangeCount > 0) {
        nextStatus = await stageAllWorkspaceGitChanges(workspace.path);
        if (nextStatus.stagedEntries.length > 0) {
          nextStatus = await commitWorkspaceGit(workspace.path, "");
        }
      }

      const project = await createCloudProject(session, workspace.name, handleCloudSessionChange);
      const identity = await getCloudRepoIdentity(session, project.id, handleCloudSessionChange);
      await configureWorkspaceCloudRemote(workspace.path, identity.url, "puppyone");
      const nextConfig = mergePuppyoneWorkspaceConfig(puppyoneConfig, {
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
        cloud: {
          projectId: project.id,
        },
      });
      await handlePuppyoneConfigChange(nextConfig);
      nextStatus = await getWorkspaceGitStatus(workspace.path);

      if (nextStatus.headCommitId) {
        nextStatus = await pushWorkspaceGit(workspace.path);
      }

      applyGitStatus(nextStatus, workspace.path);
      refreshWorkspaceContent();
      setPendingCloudBackupSetup(false);
      clearGitSelection();
      setActiveCloudSection("overview");
      setActiveView("cloud");
      setSidebarCollapsed(false);
      setSwitcherOpen(false);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCloudBackupError(message || "Unable to create PuppyOne Cloud backup.");
      setGitOperationError(createGitOperationErrorState(error, "cloud-backup", workspace.path));
      setPendingCloudBackupSetup(false);
      setActiveView("cloud");
      return false;
    } finally {
      setCloudBackupLoading(false);
      setGitOperationLoading(null);
    }
  }, [
    activeGitStatus,
    applyGitStatus,
    clearGitSelection,
    cloudEnabled,
    handleCloudSessionChange,
    handlePuppyoneConfigChange,
    puppyoneConfig,
    refreshWorkspaceContent,
    workspace,
    workspaceIsCloud,
  ]);

  const handleStartPuppyoneBackup = useCallback(() => {
    if (!cloudEnabled) return;
    if (workspaceIsCloud) return;

    setPendingCloudBackupSetup(true);
    setCloudBackupError(null);
    setGitOperationError(null);

    if (!activeCloudSession) {
      setActiveView("cloud");
      setActiveCloudSection("overview");
      setSidebarCollapsed(false);
      setSwitcherOpen(false);
    }
  }, [activeCloudSession, cloudEnabled, workspaceIsCloud]);

  useEffect(() => {
    if (!cloudEnabled) return;
    if (!pendingCloudBackupSetup || !activeCloudSession || cloudBackupLoading) return;
    void createPuppyoneCloudBackup(activeCloudSession);
  }, [activeCloudSession, cloudBackupLoading, cloudEnabled, createPuppyoneCloudBackup, pendingCloudBackupSetup]);

  useEffect(() => {
    if (!workspace || workspaceIsCloud || !window.puppyoneDesktop?.watchWorkspace) return undefined;

    return window.puppyoneDesktop.watchWorkspace(workspace.path, (event) => {
      if (!event.error) {
        setWorkspaceRefreshToken((token) => token + 1);
        void refreshGitStatus();
      }
    });
  }, [refreshGitStatus, workspace, workspaceIsCloud]);

  useEffect(() => {
    if (!workspace || workspaceIsCloud || !aiEditAssistEnabled) {
      setLatestAiEditRequest(null);
      return undefined;
    }

    const rootPath = workspace.path;
    let cancelled = false;
    setLatestAiEditRequest(null);

    void getLatestAiEditReviewRequest(rootPath)
      .then((request) => {
        if (!cancelled && workspacePathRef.current === rootPath) {
          setLatestAiEditRequest(request);
        }
      })
      .catch((error) => {
        console.warn("Unable to read latest AI edit request:", error);
      });

    const unsubscribe = subscribeAiEditReviewUpdates((event) => {
      if (event.rootPath !== rootPath || workspacePathRef.current !== rootPath) return;
      setLatestAiEditRequest(event.request);
      setWorkspaceRefreshToken((token) => token + 1);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [aiEditAssistEnabled, workspace, workspaceIsCloud]);

  const unlinkCurrentWorkspace = useCallback(async () => {
    const currentWorkspaceId = workspace?.id ?? null;
    if (!workspaceIsCloud) {
      await forgetLastWorkspace();
    }
    if (currentWorkspaceId) {
      setWorkspaces((current) => current.filter((item) => item.id !== currentWorkspaceId));
      setRecentWorkspaceItems((current) => current.filter((item) => item.workspace.id !== currentWorkspaceId));
    }
    setActiveWorkspaceId(null);
    setActiveView("data");
    setSwitcherOpen(false);
    setBranchSwitcherOpen(false);
    setRightSidebarOpen(false);
    setCreateEntryDraft(null);
    setRestoreWorkspaceError(null);
    setHomeOperationStatus(null);
    setRestoringWorkspace(false);
  }, [workspace?.id, workspaceIsCloud]);

  if (restoringWorkspace && !workspace) {
    return <RestoringWorkspaceScreen themeMode={themeMode} resolvedTheme={resolvedTheme} />;
  }

  if (!workspace) {
    return (
      <>
        <MinimalOnboarding
          onChooseWorkspace={openFolder}
          onCreateCloudProject={cloudEnabled ? createCloudProjectFromHomepage : undefined}
          onOpenCloudProject={cloudEnabled ? openCloudProjectFromHomepage : undefined}
          onOpenWorkspacePath={openWorkspacePath}
          recentWorkspaces={recentWorkspaceItems}
          cloudProjects={homeCloudProjects}
          projectItems={homeProjectItems}
          cloudSignedIn={Boolean(activeCloudSession)}
          cloudProjectsLoading={Boolean(activeCloudSession) && (homeCloudProjectsLoading || cloudSessionRestoring)}
          cloudProjectsError={homeCloudProjectsError}
          operationStatus={homeOperationStatus}
          initialError={restoreWorkspaceError}
          themeMode={themeMode}
          resolvedTheme={resolvedTheme}
        />
        <DesktopOverlayPortal theme={resolvedTheme}>
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
              if (!pendingCloudProjectCreate) void refreshHomeCloudProjects();
            }}
            onSignedOut={() => {
              handleCloudSessionChange(null);
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

  const workspaceTitlebarLabel = shortenTitlebarLabel(workspace.name, TITLEBAR_WORKSPACE_LABEL_CHARS);
  const workspaceSwitcherItems = getWorkspaceSwitcherItems({
    cloudProjects: homeCloudProjects,
    includeCloud: cloudEnabled,
    workspaces,
  });

  const workspaceSwitcher = (
    <DesktopWorkspaceSwitcher
      open={switcherOpen}
      refObject={switcherRef}
      titlebarLabel={workspaceTitlebarLabel}
      workspace={workspace}
      workspaceKind={workspaceIsCloud ? "cloud" : "local"}
      items={workspaceSwitcherItems}
      onOpenFolder={openFolder}
      onCreateCloudProject={cloudEnabled ? createCloudProjectFromHomepage : undefined}
      onOpenItem={openWorkspaceSwitcherItem}
      onGoHome={() => void goToHomepage()}
      onToggle={() => {
        setBranchSwitcherOpen(false);
        const nextOpen = !switcherOpen;
        setSwitcherOpen(nextOpen);
        if (nextOpen) void refreshHomeCloudProjects();
      }}
    />
  );

  const branchReady = !workspaceIsCloud && activeGitStatus?.isRepo === true;
  const branchLabel = branchReady ? (activeGitStatus.branch ?? "detached") : gitStatusLoading ? "Loading" : "No Git";
  const branchTitlebarLabel = shortenTitlebarLabel(branchLabel, TITLEBAR_BRANCH_LABEL_CHARS);
  const branchButtonDisabled = workspaceIsCloud || (gitStatusLoading && !activeGitStatus);

  const branchSwitcher = workspaceIsCloud ? null : (
    <div className="desktop-titlebar-branch-wrap" ref={branchSwitcherRef}>
      <button
        className="desktop-titlebar-branch-button"
        type="button"
        aria-label={branchReady ? `Switch branch: ${branchLabel}` : "Open Source Control"}
        aria-expanded={branchReady ? branchSwitcherOpen : false}
        title={branchReady ? branchLabel : "Open Source Control"}
        disabled={branchButtonDisabled}
        onClick={() => {
          if (!branchReady) {
            setActiveView("git");
            setSidebarCollapsed(false);
            setSwitcherOpen(false);
            setBranchSwitcherOpen(false);
            return;
          }
          setSwitcherOpen(false);
          setBranchSwitcherOpen((open) => !open);
        }}
      >
        <PuppyGitIcon size={13} />
        <span>{branchTitlebarLabel}</span>
        {branchReady && <ChevronDown size={12} />}
      </button>

      {branchReady && branchSwitcherOpen && (
        <div className="desktop-branch-menu desktop-titlebar-menu">
          <BranchMenuGroup
            title="Local"
            branches={localBranches}
            operationLoading={gitOperationLoading}
            onCheckout={handleCheckoutGitBranch}
            onDone={() => setBranchSwitcherOpen(false)}
          />
          {remoteBranches.length > 0 && (
            <BranchMenuGroup
              title="Remote"
              branches={remoteBranches}
              operationLoading={gitOperationLoading}
              onCheckout={handleCheckoutGitBranch}
              onDone={() => setBranchSwitcherOpen(false)}
            />
          )}
        </div>
      )}
    </div>
  );

  const titlebarSlot = (
    <div className="desktop-titlebar-context">
      {workspaceSwitcher}
      {branchSwitcher}
    </div>
  );

  const desktopTerminalEnabled = terminalToolEnabled && !workspaceIsCloud;

  const titlebarActions = (
    <DesktopTitlebarActions
      desktopUpdates={desktopUpdates}
      terminalSidebarOpen={terminalSidebarOpen && desktopTerminalEnabled}
      terminalToolEnabled={desktopTerminalEnabled}
      onClearTerminal={() => {
        setTerminalResetToken((token) => token + 1);
        setSwitcherOpen(false);
      }}
      onToggleTerminal={() => {
        setRightSidebarOpen((open) => !open);
        setSwitcherOpen(false);
      }}
      onUpdateNow={() => {
        void desktopUpdates.updateNow();
        setSwitcherOpen(false);
      }}
    />
  );

  return (
    <div className={`app-shell cloud-runtime ${resolvedTheme === "dark" ? "dark" : ""}`} data-theme-mode={themeMode}>
      <DesktopCloudShell
        titlebarSlot={titlebarSlot}
        titlebarActions={titlebarActions}
        rightSidebarOpen={terminalSidebarOpen && desktopTerminalEnabled}
        resizableRightSidebar
        rightSidebarWidth={rightSidebarWidth}
        minRightSidebarWidth={MIN_RIGHT_SIDEBAR_WIDTH}
        maxRightSidebarWidth={MAX_RIGHT_SIDEBAR_WIDTH}
        onRightSidebarWidthChange={setRightSidebarWidth}
        rightSidebar={desktopTerminalEnabled ? (
          <RightTerminalPanel
            key={`${workspace.path}:${terminalResetToken}`}
            workspace={workspace}
            active={terminalSidebarOpen && desktopTerminalEnabled}
          />
        ) : undefined}
      >
        <DesktopWorkspaceContent
          activeAiEditRequest={activeAiEditRequest}
          activeDataPath={activeDataPath}
          activeView={activeView}
          cloud={{
            activeSection: activeCloudSection,
            backupError: cloudBackupError,
            backupLoading: cloudBackupLoading,
            cloudApiBaseUrl: desktopCloudApiBaseUrl,
            cloudSession: activeCloudSession,
            storedCloudSession: cloudSession,
            enabled: cloudEnabled,
            projectId: cloudProjectId,
            sessionRestoring: cloudSessionRestoring,
            onCloudSessionChange: handleCloudSessionChange,
            onConfigureCloudRemote: handleConfigureCloudRemote,
            onOpenDetails: () => {
              if (!cloudEnabled) return;
              setActiveView("cloud");
              setActiveCloudSection("overview");
              setSidebarCollapsed(false);
              setSwitcherOpen(false);
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
          onActiveDataPathChange={handleActiveDataPathChange}
          onCreateEntryMenu={openCreateEntryMenu}
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
          workspaceKind={workspaceIsCloud ? "cloud" : "local"}
          workspaceKey={workspaceKey}
          workspaceRefreshToken={workspaceRefreshToken}
        />
      </DesktopCloudShell>
      <DesktopOverlayPortal theme={resolvedTheme}>
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
                fileIconTheme={fileIconTheme}
                onCancel={() => setCreateEntryDraft(null)}
                onSelectKind={selectCreateEntryKind}
              />
            )
          )}
          {nodeActionMenu && (
            <DesktopNodeActionMenu
              draft={nodeActionMenu}
              showRevealInFinder={!workspaceIsCloud}
              onChange={setNodeActionMenu}
              onCancel={() => setNodeActionMenu(null)}
              onRename={renameNodeFromMenu}
              onDelete={deleteNodeFromMenu}
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
        </>
      </DesktopOverlayPortal>
    </div>
  );
}
