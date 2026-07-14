import { useCallback, useEffect, useRef, useState } from "react";
import {
  getCloudProject,
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
  mappedProjectId: string | null;
  mappedProject: DesktopCloudProject | null;
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
  boundProjectId = null,
  onSessionChange,
  workspaceRevisionKey = null,
  loadProjectDetails = true,
}: {
  session: DesktopCloudSession | null;
  cloudEnvironment: CloudEnvironment;
  /** Exact Project identity owned by an explicit global/Cloud-only route. */
  explicitProjectId: string | null;
  /** Exact Project context resolved for the local workspace by the app shell. */
  boundProjectId?: string | null;
  onSessionChange: (session: DesktopCloudSession | null) => void;
  workspaceRevisionKey?: string | null;
  loadProjectDetails?: boolean;
}): DesktopCloudDataState {
  const cloudApiBaseUrl = cloudEnvironment.apiBaseUrl;
  const normalizedBoundProjectId = boundProjectId?.trim() || null;
  const contextKey = createCloudDataContextKey({
    session,
    cloudEnvironment,
    explicitProjectId,
    boundProjectId: normalizedBoundProjectId,
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
    const activeProjectId = explicitProjectId?.trim() || normalizedBoundProjectId;

    const activeSession = sessionRef.current;
    if (!activeSession || !activeProjectId) {
      setState(createCloudDataState({
        mappedProjectId: normalizedBoundProjectId,
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
            mappedProjectId: normalizedBoundProjectId,
            activeProjectId: explicitProjectId || normalizedBoundProjectId,
            initializing: true,
            loading: true,
            contextKey,
          })
    ));

    try {
      const project = await getCloudProject(
        activeSession,
        activeProjectId,
        onSessionChangeRef.current,
        cloudApiBaseUrl,
      );
      const projects = [project];
      if (activeRequestRef.current !== requestId) return;

      // Mapping is owned by useCloudWorkspaceBinding. This hook only loads data
      // for an already-authorized local context or an explicit Project route.
      const mappedProjectId = normalizedBoundProjectId;
      const mappedProject = mappedProjectId
        ? projects.find((project) => project.id === mappedProjectId) ?? null
        : null;
      if (!loadProjectDetails) {
        setState(createCloudDataState({
          projects,
          mappedProjectId,
          mappedProject,
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
        mappedProjectId,
        mappedProject,
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
              error: cloudMessage("cloud-data-load-failed", undefined, loadError instanceof Error ? loadError.message : undefined),
              warning: null,
            }
          : createCloudDataState({
              initializing: false,
              loading: false,
              error: cloudMessage("cloud-data-load-failed", undefined, loadError instanceof Error ? loadError.message : undefined),
              contextKey,
            })
      ));
    }
  }, [
    cloudApiBaseUrl,
    contextKey,
    loadProjectDetails,
    normalizedBoundProjectId,
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
        mappedProjectId: normalizedBoundProjectId,
        activeProjectId: explicitProjectId || normalizedBoundProjectId,
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
  boundProjectId,
}: {
  session: DesktopCloudSession | null;
  cloudEnvironment: CloudEnvironment;
  explicitProjectId: string | null;
  boundProjectId: string | null;
}): string {
  if (!session) return "signed-out";
  return [
    session.user_id,
    session.user_email,
    session.session_generation,
    session.api_base_url ?? "",
    cloudEnvironment.cloudRemote?.rawUrl ?? "",
    cloudEnvironment.configuredProjectId ?? "",
    boundProjectId ?? "",
    explicitProjectId ?? "",
  ].join("\n");
}

function createCloudDataState(
  overrides: Partial<DesktopCloudDataInternalState> = {},
): DesktopCloudDataInternalState {
  return {
    projects: [],
    mappedProjectId: null,
    mappedProject: null,
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
