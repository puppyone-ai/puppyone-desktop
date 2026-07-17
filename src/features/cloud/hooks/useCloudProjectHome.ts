import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useLocalization } from "@puppyone/localization";
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
  resolveRecentWorkspaceCloudContext,
  type RecentWorkspaceCloudContext,
} from "../workspace/cloudProjectResolution";
import {
  cloudMessage,
  formatCloudMessage,
  type CloudMessageDescriptor,
} from "../cloudPresentation";

export function useCloudProjectHome({
  activeCloudSession,
  autoRefreshProjectCatalog = true,
  autoResolveRecentWorkspaceContexts = true,
  cloudEnabled,
  desktopCloudApiBaseUrl,
  includeUnboundCloudProjects = true,
  onOpenCloudProject,
  onPendingCloudProjectCreateReady,
  recentWorkspaceItems,
  setHomeOperationStatus,
  showBrowserSignInStatus,
  startCloudBrowserSignIn,
  updateCloudSession,
}: {
  activeCloudSession: DesktopCloudSession | null;
  autoRefreshProjectCatalog?: boolean;
  autoResolveRecentWorkspaceContexts?: boolean;
  cloudEnabled: boolean;
  desktopCloudApiBaseUrl: string | null;
  includeUnboundCloudProjects?: boolean;
  onOpenCloudProject: (project: DesktopCloudProject) => Promise<void> | void;
  onPendingCloudProjectCreateReady?: () => void;
  recentWorkspaceItems: RecentWorkspaceHomeItem[];
  setHomeOperationStatus: Dispatch<SetStateAction<OnboardingOperationStatus | null>>;
  showBrowserSignInStatus: (detail: string) => void;
  startCloudBrowserSignIn: () => Promise<boolean>;
  updateCloudSession: (session: DesktopCloudSession | null) => void;
}) {
  const { t } = useLocalization();
  const [homeCloudProjects, setHomeCloudProjects] = useState<DesktopCloudProject[]>([]);
  const [homeCloudProjectsLoading, setHomeCloudProjectsLoading] = useState(false);
  const [homeCloudProjectsErrorState, setHomeCloudProjectsErrorState] = useState<CloudMessageDescriptor | null>(null);
  const [recentWorkspaceCloudContexts, setRecentWorkspaceCloudContexts] = useState<Record<string, RecentWorkspaceCloudContext>>({});
  const [pendingCloudProjectCreate, setPendingCloudProjectCreate] = useState(false);
  const [homeCloudProjectCreateDialogOpen, setHomeCloudProjectCreateDialogOpen] = useState(false);
  const [homeCloudProjectCreateSubmitting, setHomeCloudProjectCreateSubmitting] = useState(false);
  const [homeCloudProjectCreateError, setHomeCloudProjectCreateError] = useState<string | null>(null);
  const homeCloudProjectCreateAttemptRef = useRef<{ organizationId: string; idempotencyKey: string } | null>(null);
  const homeCloudProjectCreateRequestRef = useRef<symbol | null>(null);
  const activeCloudSessionRef = useRef(activeCloudSession);
  const updateCloudSessionRef = useRef(updateCloudSession);
  activeCloudSessionRef.current = activeCloudSession;
  updateCloudSessionRef.current = updateCloudSession;
  const cloudSessionIdentityKey = activeCloudSession
    ? [
        activeCloudSession.user_id,
        activeCloudSession.session_generation,
        activeCloudSession.api_base_url,
      ].join("\n")
    : "signed-out";
  const homeCloudProjectsError = homeCloudProjectsErrorState
    ? formatCloudMessage(homeCloudProjectsErrorState, t)
    : null;
  const setHomeCloudProjectsError = useCallback((error: string | null) => {
    setHomeCloudProjectsErrorState(error
      ? cloudMessage("project-list-load-failed", undefined, error)
      : null);
  }, []);

  const refreshHomeCloudProjects = useCallback(async () => {
    const activeSession = activeCloudSessionRef.current;
    if (!cloudEnabled || cloudSessionIdentityKey === "signed-out" || !activeSession) {
      setHomeCloudProjects([]);
      setHomeCloudProjectsLoading(false);
      setHomeCloudProjectsErrorState(null);
      return;
    }

    setHomeCloudProjectsLoading(true);
    setHomeCloudProjectsErrorState(null);
    try {
      const projects = await listCloudProjects(
        activeSession,
        updateCloudSessionRef.current,
        desktopCloudApiBaseUrl,
      );
      setHomeCloudProjects(projects);
    } catch (error) {
      setHomeCloudProjectsErrorState(cloudMessage(
        "project-list-load-failed",
        undefined,
        error instanceof Error ? error.message : String(error),
      ));
    } finally {
      setHomeCloudProjectsLoading(false);
    }
  }, [cloudEnabled, cloudSessionIdentityKey, desktopCloudApiBaseUrl]);

  const recentWorkspaceContextKey = useMemo(
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
    if (!autoResolveRecentWorkspaceContexts) return undefined;
    const items = recentWorkspaceItems.slice(0, 20);
    if (!cloudEnabled || items.length === 0) {
      setRecentWorkspaceCloudContexts({});
      return undefined;
    }

    let cancelled = false;
    void Promise.all(
      items.map((item) => resolveRecentWorkspaceCloudContext({
        apiBaseUrl: desktopCloudApiBaseUrl,
        item,
        onSessionChange: updateCloudSessionRef.current,
        projects: homeCloudProjectsRef.current,
        session: activeCloudSessionRef.current,
      })),
    )
      .then((entries) => {
        if (cancelled) return;
        setRecentWorkspaceCloudContexts(Object.fromEntries(entries));
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn("Unable to resolve recent workspace Cloud repository contexts:", error);
          setRecentWorkspaceCloudContexts({});
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    autoResolveRecentWorkspaceContexts,
    cloudEnabled,
    cloudSessionIdentityKey,
    desktopCloudApiBaseUrl,
    homeCloudProjectIdsKey,
    recentWorkspaceContextKey,
    recentWorkspaceItems,
  ]);

  const homeProjectItems = useMemo(
    () => getHomeProjectItems({
      contexts: recentWorkspaceCloudContexts,
      cloudProjects: homeCloudProjects,
      includeUnboundCloudProjects,
      recentWorkspaceItems,
    }),
    [homeCloudProjects, includeUnboundCloudProjects, recentWorkspaceCloudContexts, recentWorkspaceItems],
  );

  const activateCreatedCloudProject = useCallback(async (
    session: DesktopCloudSession,
    organizationId: string,
    idempotencyKey: string,
  ) => {
    setHomeOperationStatus({
      title: t("onboarding.operation.creatingCloud.title"),
      detail: t("onboarding.operation.creatingCloud.detail"),
    });
    const project = await createCloudProject(
      session,
      {
        name: t("onboarding.projects.untitled"),
        description: null,
        org_id: organizationId,
      },
      idempotencyKey,
      updateCloudSession,
      desktopCloudApiBaseUrl,
    );
    setHomeOperationStatus({
      title: t("onboarding.operation.openingCloud.title"),
      detail: t("onboarding.operation.openingCloud.detail"),
    });
    setHomeCloudProjects((current) => [project, ...current.filter((item) => item.id !== project.id)]);
    await onOpenCloudProject(project);
  }, [desktopCloudApiBaseUrl, onOpenCloudProject, setHomeOperationStatus, t, updateCloudSession]);

  const createCloudProjectFromHomepage = useCallback(async () => {
    if (!activeCloudSession) {
      setPendingCloudProjectCreate(true);
      showBrowserSignInStatus(t("onboarding.status.signInToCreateCloud"));
      void startCloudBrowserSignIn();
      return;
    }
    setPendingCloudProjectCreate(false);
    setHomeCloudProjectCreateError(null);
    setHomeCloudProjectCreateDialogOpen(true);
  }, [
    activeCloudSession,
    showBrowserSignInStatus,
    startCloudBrowserSignIn,
    t,
  ]);

  useEffect(() => {
    if (!pendingCloudProjectCreate || !activeCloudSession) return undefined;

    setPendingCloudProjectCreate(false);
    onPendingCloudProjectCreateReady?.();
    setHomeCloudProjectCreateError(null);
    setHomeCloudProjectCreateDialogOpen(true);

    return undefined;
  }, [
    activeCloudSession,
    pendingCloudProjectCreate,
    onPendingCloudProjectCreateReady,
  ]);

  const submitHomeCloudProjectCreate = useCallback(async (organizationId: string) => {
    const session = activeCloudSessionRef.current;
    const normalizedOrganizationId = organizationId.trim();
    if (!session || !normalizedOrganizationId || homeCloudProjectCreateRequestRef.current) return;
    const existingAttempt = homeCloudProjectCreateAttemptRef.current;
    const attempt = existingAttempt?.organizationId === normalizedOrganizationId
      ? existingAttempt
      : {
          organizationId: normalizedOrganizationId,
          idempotencyKey: crypto.randomUUID(),
    };
    homeCloudProjectCreateAttemptRef.current = attempt;
    const request = Symbol("create-home-cloud-project");
    homeCloudProjectCreateRequestRef.current = request;
    setHomeCloudProjectCreateSubmitting(true);
    setHomeCloudProjectCreateError(null);
    try {
      await activateCreatedCloudProject(session, attempt.organizationId, attempt.idempotencyKey);
      homeCloudProjectCreateAttemptRef.current = null;
      setHomeCloudProjectCreateDialogOpen(false);
    } catch (error) {
      setHomeOperationStatus(null);
      setHomeCloudProjectCreateError(formatCloudMessage(
        cloudMessage(
          "project-open-failed",
          undefined,
          error instanceof Error ? error.message : String(error),
        ),
        t,
      ));
    } finally {
      if (homeCloudProjectCreateRequestRef.current === request) {
        homeCloudProjectCreateRequestRef.current = null;
        setHomeCloudProjectCreateSubmitting(false);
      }
    }
  }, [activateCreatedCloudProject, setHomeOperationStatus, t]);

  const cancelHomeCloudProjectCreate = useCallback(() => {
    if (homeCloudProjectCreateRequestRef.current) return;
    homeCloudProjectCreateAttemptRef.current = null;
    setHomeCloudProjectCreateError(null);
    setHomeCloudProjectCreateDialogOpen(false);
  }, []);

  useEffect(() => {
    if (activeCloudSession) return;
    homeCloudProjectCreateAttemptRef.current = null;
    setHomeCloudProjectCreateDialogOpen(false);
    setHomeCloudProjectCreateError(null);
  }, [activeCloudSession]);

  const openCloudProjectFromHomepage = useCallback(async (projectId: string) => {
    if (!activeCloudSession) {
      showBrowserSignInStatus(t("onboarding.status.signInToOpenCloud"));
      void startCloudBrowserSignIn();
      return;
    }

    setHomeOperationStatus({
      title: t("onboarding.operation.openingCloud.title"),
      detail: t("onboarding.operation.openingCloud.detail"),
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
    t,
    updateCloudSession,
  ]);

  useEffect(() => {
    if (!autoRefreshProjectCatalog) return;
    void refreshHomeCloudProjects();
  }, [autoRefreshProjectCatalog, refreshHomeCloudProjects]);

  return {
    createCloudProjectFromHomepage,
    cancelHomeCloudProjectCreate,
    homeCloudProjects,
    homeCloudProjectsError,
    homeCloudProjectsLoading,
    homeCloudProjectCreateDialogOpen,
    homeCloudProjectCreateError,
    homeCloudProjectCreateSubmitting,
    homeProjectItems,
    openCloudProjectFromHomepage,
    pendingCloudProjectCreate,
    recentWorkspaceCloudContexts,
    refreshHomeCloudProjects,
    setHomeCloudProjects,
    setHomeCloudProjectsError,
    setPendingCloudProjectCreate,
    setRecentWorkspaceCloudContexts,
    submitHomeCloudProjectCreate,
  };
}
