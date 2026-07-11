import { useCallback, useEffect, useRef, useState } from "react";
import {
  listCloudProjects,
  type DesktopCloudConnector,
  type DesktopCloudDashboard,
  type DesktopCloudMcpEndpoint,
  type DesktopCloudProject,
  type DesktopCloudRepoIdentity,
  type DesktopCloudScope,
  type DesktopCloudSession,
  type DesktopCloudTree,
} from "../../../lib/cloudApi";
import type { DesktopCloudHistory } from "../../../lib/cloudHistoryApi";
import type { CloudEnvironment } from "../environment";
import { loadCloudProjectDetails } from "./cloudProjectDetails";

export { resolveMappedCloudProjectId } from "../workspace";

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
  initializing: boolean;
  loading: boolean;
  error: string | null;
  warning: string | null;
  reload: () => Promise<void>;
};

type DesktopCloudDataInternalState = Omit<DesktopCloudDataState, "reload"> & {
  contextKey: string | null;
};

export function useDesktopCloudData({
  session,
  cloudEnvironment,
  selectedProjectId,
  boundProjectId = null,
  onSessionChange,
  workspaceRevisionKey = null,
  loadProjectDetails = true,
}: {
  session: DesktopCloudSession | null;
  cloudEnvironment: CloudEnvironment;
  /** A transient project opened from Cloud Projects. This never creates a local binding. */
  selectedProjectId: string | null;
  /** The project identity already bound to the local workspace, resolved by the app shell. */
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
    selectedProjectId,
    boundProjectId: normalizedBoundProjectId,
  });
  const [state, setState] = useState<DesktopCloudDataInternalState>(() => createCloudDataState());
  const activeRequestRef = useRef(0);
  const hasCurrentContext = state.contextKey === contextKey;

  const load = useCallback(async () => {
    const requestId = activeRequestRef.current + 1;
    activeRequestRef.current = requestId;

    if (!session) {
      setState(createCloudDataState({
        mappedProjectId: normalizedBoundProjectId,
        activeProjectId: selectedProjectId || normalizedBoundProjectId,
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
            activeProjectId: selectedProjectId || normalizedBoundProjectId,
            initializing: true,
            loading: true,
            contextKey,
          })
    ));

    try {
      const projects = await listCloudProjects(session, onSessionChange, cloudApiBaseUrl);
      if (activeRequestRef.current !== requestId) return;

      // Mapping is owned by useCloudWorkspaceBinding. This hook only loads data
      // for an already-verified bound project or an explicit browse selection.
      const mappedProjectId = normalizedBoundProjectId;
      const mappedProject = mappedProjectId
        ? projects.find((project) => project.id === mappedProjectId) ?? null
        : null;
      const activeProjectId = selectedProjectId || mappedProjectId;

      if (!activeProjectId) {
        setState(createCloudDataState({
          projects,
          mappedProjectId,
          mappedProject,
          initializing: false,
          loading: false,
          contextKey,
        }));
        return;
      }

      if (!loadProjectDetails) {
        setState(createCloudDataState({
          projects,
          mappedProjectId,
          mappedProject,
          activeProjectId,
          activeProject: projects.find((project) => project.id === activeProjectId) ?? mappedProject,
          initializing: false,
          loading: false,
          contextKey,
        }));
        return;
      }

      const details = await loadCloudProjectDetails({
        session,
        projectId: activeProjectId,
        projects,
        onSessionChange,
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
              error: loadError instanceof Error ? loadError.message : "Unable to load Cloud workspace.",
              warning: null,
            }
          : createCloudDataState({
              initializing: false,
              loading: false,
              error: loadError instanceof Error ? loadError.message : "Unable to load Cloud workspace.",
              contextKey,
            })
      ));
    }
  }, [
    cloudApiBaseUrl,
    contextKey,
    loadProjectDetails,
    normalizedBoundProjectId,
    onSessionChange,
    selectedProjectId,
    session,
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
        activeProjectId: selectedProjectId || normalizedBoundProjectId,
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
  selectedProjectId,
  boundProjectId,
}: {
  session: DesktopCloudSession | null;
  cloudEnvironment: CloudEnvironment;
  selectedProjectId: string | null;
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
    selectedProjectId ?? "",
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
