import { useCallback, useEffect, useRef, useState } from "react";
import {
  getCloudProject,
  listCloudProjects,
  type DesktopCloudConnector,
  type DesktopCloudDashboard,
  type DesktopCloudMcpEndpoint,
  type DesktopCloudProject,
  type DesktopCloudProjectReadiness,
  type DesktopCloudRepoIdentity,
  type DesktopCloudScope,
  type DesktopCloudSession,
  type DesktopCloudTree,
} from "../../../lib/cloudApi";
import type { DesktopCloudHistory } from "../../../lib/cloudHistoryApi";
import type { CloudEnvironment } from "../environment";
import { loadCloudProjectDetails } from "./cloudProjectDetails";
import { cloudMessage, type CloudMessageDescriptor } from "../cloudPresentation";


export type DesktopCloudDataState = {
  projects: DesktopCloudProject[];
  contextProjectId: string | null;
  contextProject: DesktopCloudProject | null;
  activeProjectId: string | null;
  activeProject: DesktopCloudProject | null;
  dashboard: DesktopCloudDashboard | null;
  tree: DesktopCloudTree | null;
  history: DesktopCloudHistory | null;
  scopes: DesktopCloudScope[];
  connectors: DesktopCloudConnector[];
  mcpEndpoints: DesktopCloudMcpEndpoint[];
  identity: DesktopCloudRepoIdentity | null;
  readiness: DesktopCloudProjectReadiness | null;
  initializing: boolean;
  loading: boolean;
  error: CloudMessageDescriptor | null;
  warning: CloudMessageDescriptor | null;
  reload: () => Promise<void>;
};

type DesktopCloudDataInternalState = Omit<DesktopCloudDataState, "reload"> & {
  contextKey: string | null;
};

export function useDesktopCloudData({
  session,
  cloudEnvironment,
  explicitProjectId,
  repositoryProjectId = null,
  onSessionChange,
  workspaceRevisionKey = null,
  loadProjectDetails = true,
  loadProjectCatalog = false,
}: {
  session: DesktopCloudSession | null;
  cloudEnvironment: CloudEnvironment;
  /** Exact Project identity owned by an explicit global/Cloud-only route. */
  explicitProjectId: string | null;
  /** Exact Project context resolved for the local workspace by the app shell. */
  repositoryProjectId?: string | null;
  onSessionChange: (session: DesktopCloudSession | null) => void;
  workspaceRevisionKey?: string | null;
  loadProjectDetails?: boolean;
  /** Load the organization Project catalog when no exact Project context exists. */
  loadProjectCatalog?: boolean;
}): DesktopCloudDataState {
  const cloudApiBaseUrl = cloudEnvironment.apiBaseUrl;
  const normalizedRepositoryProjectId = repositoryProjectId?.trim() || null;
  const contextKey = createCloudDataContextKey({
    session,
    cloudEnvironment,
    explicitProjectId,
    repositoryProjectId: normalizedRepositoryProjectId,
    loadProjectCatalog,
  });
  const [state, setState] = useState<DesktopCloudDataInternalState>(() => createCloudDataState());
  const activeRequestRef = useRef(0);
  const sessionRef = useRef(session);
  const onSessionChangeRef = useRef(onSessionChange);
  sessionRef.current = session;
  onSessionChangeRef.current = onSessionChange;
  const hasCurrentContext = state.contextKey === contextKey;

  const load = useCallback(async () => {
    const requestId = activeRequestRef.current + 1;
    activeRequestRef.current = requestId;
    const activeProjectId = loadProjectCatalog
      ? null
      : explicitProjectId?.trim() || normalizedRepositoryProjectId;

    const activeSession = sessionRef.current;
    if (!activeSession || (!activeProjectId && !loadProjectCatalog)) {
      setState(createCloudDataState({
        contextProjectId: normalizedRepositoryProjectId,
        activeProjectId,
        initializing: false,
        loading: false,
        contextKey,
      }));
      return;
    }

    setState((current) => (
      current.contextKey === contextKey
        ? {
            ...current,
            initializing: false,
            loading: true,
            error: null,
            warning: null,
          }
        : createCloudDataState({
            contextProjectId: normalizedRepositoryProjectId,
            activeProjectId: explicitProjectId || normalizedRepositoryProjectId,
            initializing: true,
            loading: true,
            contextKey,
          })
    ));

    try {
      if (!activeProjectId) {
        const projects = await listCloudProjects(
          activeSession,
          onSessionChangeRef.current,
          cloudApiBaseUrl,
        );
        if (activeRequestRef.current !== requestId) return;
        setState(createCloudDataState({
          projects,
          contextProjectId: normalizedRepositoryProjectId,
          contextProject: normalizedRepositoryProjectId
            ? projects.find((project) => project.id === normalizedRepositoryProjectId) ?? null
            : null,
          initializing: false,
          loading: false,
          contextKey,
        }));
        return;
      }

      const project = await getCloudProject(
        activeSession,
        activeProjectId,
        onSessionChangeRef.current,
        cloudApiBaseUrl,
      );
      const projects = [project];
      if (activeRequestRef.current !== requestId) return;

      // Repository-context resolution owns identity and authorization. This
      // hook only loads data for that Project or an explicit global route.
      const contextProjectId = normalizedRepositoryProjectId;
      const contextProject = contextProjectId
        ? projects.find((project) => project.id === contextProjectId) ?? null
        : null;
      if (!loadProjectDetails) {
        setState(createCloudDataState({
          projects,
          contextProjectId,
          contextProject,
          activeProjectId,
          activeProject: project,
          initializing: false,
          loading: false,
          contextKey,
        }));
        return;
      }

      const details = await loadCloudProjectDetails({
        session: activeSession,
        projectId: activeProjectId,
        projects,
        onSessionChange: onSessionChangeRef.current,
        cloudApiBaseUrl,
      });
      if (activeRequestRef.current !== requestId) return;

      setState({
        projects,
        contextProjectId,
        contextProject,
        activeProjectId,
        activeProject: details.activeProject,
        dashboard: details.dashboard,
        tree: details.tree,
        history: details.history,
        scopes: details.scopes,
        connectors: details.connectors,
        mcpEndpoints: details.mcpEndpoints,
        identity: details.identity,
        readiness: details.readiness,
        initializing: false,
        loading: false,
        error: null,
        warning: details.warning,
        contextKey,
      });
    } catch (loadError) {
      if (activeRequestRef.current !== requestId) return;
      setState((current) => (
        current.contextKey === contextKey
          ? {
              ...current,
              initializing: false,
              loading: false,
              error: cloudMessage(
                activeProjectId ? "cloud-data-load-failed" : "project-list-load-failed",
                undefined,
                loadError instanceof Error ? loadError.message : undefined,
              ),
              warning: null,
            }
          : createCloudDataState({
              initializing: false,
              loading: false,
              error: cloudMessage(
                activeProjectId ? "cloud-data-load-failed" : "project-list-load-failed",
                undefined,
                loadError instanceof Error ? loadError.message : undefined,
              ),
              contextKey,
            })
      ));
    }
  }, [
    cloudApiBaseUrl,
    contextKey,
    loadProjectCatalog,
    loadProjectDetails,
    normalizedRepositoryProjectId,
    explicitProjectId,
  ]);

  useEffect(() => {
    void load();
    return () => {
      activeRequestRef.current += 1;
    };
  }, [load, workspaceRevisionKey]);

  if (session && !hasCurrentContext) {
    return {
      ...toPublicCloudDataState(createCloudDataState({
        contextProjectId: normalizedRepositoryProjectId,
        activeProjectId: explicitProjectId || normalizedRepositoryProjectId,
        initializing: true,
        loading: true,
      })),
      reload: load,
    };
  }

  return { ...toPublicCloudDataState(state), reload: load };
}

function createCloudDataContextKey({
  session,
  cloudEnvironment,
  explicitProjectId,
  repositoryProjectId,
  loadProjectCatalog,
}: {
  session: DesktopCloudSession | null;
  cloudEnvironment: CloudEnvironment;
  explicitProjectId: string | null;
  repositoryProjectId: string | null;
  loadProjectCatalog: boolean;
}): string {
  if (!session) return "signed-out";
  return [
    session.user_id,
    session.user_email,
    session.session_generation,
    session.api_base_url ?? "",
    cloudEnvironment.cloudRemote?.rawUrl ?? "",
    repositoryProjectId ?? "",
    explicitProjectId ?? "",
    loadProjectCatalog ? "catalog" : "project",
  ].join("\n");
}

function createCloudDataState(
  overrides: Partial<DesktopCloudDataInternalState> = {},
): DesktopCloudDataInternalState {
  return {
    projects: [],
    contextProjectId: null,
    contextProject: null,
    activeProjectId: null,
    activeProject: null,
    dashboard: null,
    tree: null,
    history: null,
    scopes: [],
    connectors: [],
    mcpEndpoints: [],
    identity: null,
    readiness: null,
    initializing: false,
    loading: false,
    error: null,
    warning: null,
    contextKey: null,
    ...overrides,
  };
}

function toPublicCloudDataState({
  contextKey,
  ...publicState
}: DesktopCloudDataInternalState): Omit<DesktopCloudDataState, "reload"> {
  void contextKey;
  return publicState;
}
