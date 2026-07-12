import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type {
  OnboardingOperationStatus,
  RecentWorkspaceHomeItem,
} from "../../../components/MinimalOnboarding";
import {
  createCloudProject,
  getCloudProject,
  listCloudProjects,
  type DesktopCloudProject,
  type DesktopCloudSession,
} from "../../../lib/cloudApi";
import {
  getHomeProjectItems,
} from "../../app-shell/workspaceHomeModel";
import {
  resolveRecentWorkspaceCloudBinding,
  type RecentWorkspaceCloudBinding,
} from "../workspace/cloudProjectResolution";

export function useCloudProjectHome({
  activeCloudSession,
  cloudEnabled,
  desktopCloudApiBaseUrl,
  includeUnboundCloudProjects = true,
  onOpenCloudProject,
  onPendingCloudProjectCreateReady,
  recentWorkspaceItems,
  setHomeOperationStatus,
  setRestoreWorkspaceError,
  showBrowserSignInStatus,
  startCloudBrowserSignIn,
  updateCloudSession,
}: {
  activeCloudSession: DesktopCloudSession | null;
  cloudEnabled: boolean;
  desktopCloudApiBaseUrl: string | null;
  includeUnboundCloudProjects?: boolean;
  onOpenCloudProject: (project: DesktopCloudProject) => Promise<void> | void;
  onPendingCloudProjectCreateReady?: () => void;
  recentWorkspaceItems: RecentWorkspaceHomeItem[];
  setHomeOperationStatus: Dispatch<SetStateAction<OnboardingOperationStatus | null>>;
  setRestoreWorkspaceError: (error: string | null) => void;
  showBrowserSignInStatus: (detail: string) => void;
  startCloudBrowserSignIn: () => Promise<void>;
  updateCloudSession: (session: DesktopCloudSession | null) => void;
}) {
  const [homeCloudProjects, setHomeCloudProjects] = useState<DesktopCloudProject[]>([]);
  const [homeCloudProjectsLoading, setHomeCloudProjectsLoading] = useState(false);
  const [homeCloudProjectsError, setHomeCloudProjectsError] = useState<string | null>(null);
  const [recentWorkspaceCloudBindings, setRecentWorkspaceCloudBindings] = useState<Record<string, RecentWorkspaceCloudBinding>>({});
  const [pendingCloudProjectCreate, setPendingCloudProjectCreate] = useState(false);

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
      const projects = await listCloudProjects(
        activeCloudSession,
        updateCloudSession,
        desktopCloudApiBaseUrl,
      );
      setHomeCloudProjects(projects);
    } catch (error) {
      setHomeCloudProjectsError(error instanceof Error ? error.message : String(error));
    } finally {
      setHomeCloudProjectsLoading(false);
    }
  }, [activeCloudSession, cloudEnabled, desktopCloudApiBaseUrl, updateCloudSession]);

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
  const homeCloudProjectsRef = useRef(homeCloudProjects);
  homeCloudProjectsRef.current = homeCloudProjects;

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
        projects: homeCloudProjectsRef.current,
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
      includeUnboundCloudProjects,
      recentWorkspaceItems,
    }),
    [homeCloudProjects, includeUnboundCloudProjects, recentWorkspaceCloudBindings, recentWorkspaceItems],
  );

  const activateCreatedCloudProject = useCallback(async (session: DesktopCloudSession) => {
    setHomeOperationStatus({
      title: "Creating cloud project",
      detail: "Preparing a new Puppyone Cloud workspace.",
    });
    const project = await createCloudProject(
      session,
      "Untitled Project",
      updateCloudSession,
      desktopCloudApiBaseUrl,
    );
    setHomeOperationStatus({
      title: "Opening cloud project",
      detail: "Loading the new workspace.",
    });
    setHomeCloudProjects((current) => [project, ...current.filter((item) => item.id !== project.id)]);
    await onOpenCloudProject(project);
  }, [desktopCloudApiBaseUrl, onOpenCloudProject, setHomeOperationStatus, updateCloudSession]);

  const createCloudProjectFromHomepage = useCallback(async () => {
    if (!activeCloudSession) {
      setPendingCloudProjectCreate(true);
      showBrowserSignInStatus("Sign in to Puppyone Cloud, then this project will be created.");
      void startCloudBrowserSignIn();
      return;
    }
    setPendingCloudProjectCreate(false);
    try {
      await activateCreatedCloudProject(activeCloudSession);
    } catch (error) {
      setHomeOperationStatus(null);
      throw error;
    }
  }, [
    activateCreatedCloudProject,
    activeCloudSession,
    setHomeOperationStatus,
    showBrowserSignInStatus,
    startCloudBrowserSignIn,
  ]);

  useEffect(() => {
    if (!pendingCloudProjectCreate || !activeCloudSession) return undefined;

    let cancelled = false;
    setPendingCloudProjectCreate(false);
    onPendingCloudProjectCreateReady?.();
    void activateCreatedCloudProject(activeCloudSession).catch((error) => {
      if (!cancelled) {
        setHomeOperationStatus(null);
        setRestoreWorkspaceError(error instanceof Error ? error.message : String(error));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    activateCreatedCloudProject,
    activeCloudSession,
    pendingCloudProjectCreate,
    onPendingCloudProjectCreateReady,
    setHomeOperationStatus,
    setRestoreWorkspaceError,
  ]);

  const openCloudProjectFromHomepage = useCallback(async (projectId: string) => {
    if (!activeCloudSession) {
      showBrowserSignInStatus("Sign in to Puppyone Cloud, then open this project again.");
      void startCloudBrowserSignIn();
      return;
    }

    setHomeOperationStatus({
      title: "Opening cloud project",
      detail: "Loading the project workspace.",
    });
    try {
      const project = homeCloudProjects.find((item) => item.id === projectId)
        ?? await getCloudProject(
          activeCloudSession,
          projectId,
          updateCloudSession,
          desktopCloudApiBaseUrl,
        );
      await onOpenCloudProject(project);
    } catch (error) {
      setHomeOperationStatus(null);
      throw error;
    }
  }, [
    activeCloudSession,
    desktopCloudApiBaseUrl,
    homeCloudProjects,
    onOpenCloudProject,
    setHomeOperationStatus,
    showBrowserSignInStatus,
    startCloudBrowserSignIn,
    updateCloudSession,
  ]);

  useEffect(() => {
    void refreshHomeCloudProjects();
  }, [refreshHomeCloudProjects]);

  return {
    createCloudProjectFromHomepage,
    homeCloudProjects,
    homeCloudProjectsError,
    homeCloudProjectsLoading,
    homeProjectItems,
    openCloudProjectFromHomepage,
    pendingCloudProjectCreate,
    recentWorkspaceCloudBindings,
    refreshHomeCloudProjects,
    setHomeCloudProjects,
    setHomeCloudProjectsError,
    setPendingCloudProjectCreate,
    setRecentWorkspaceCloudBindings,
  };
}
