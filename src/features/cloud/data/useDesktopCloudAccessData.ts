import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getCloudRepoIdentity,
  listCloudConnectors,
  listCloudMcpEndpoints,
  listCloudScopes,
  type DesktopCloudConnector,
  type DesktopCloudMcpEndpoint,
  type DesktopCloudRepoIdentity,
  type DesktopCloudScope,
  type DesktopCloudSession,
} from "../../../lib/cloudApi";
import {
  getCloudScopeRows,
  scopeMatchesMcpEndpoint,
  unwrapSettled,
} from "../utils";
import { buildDesktopCloudAccessRows, type CloudAccessSurfaceRow } from "../sections/access/accessRows";
import { cloudMessage, type CloudMessageDescriptor } from "../cloudPresentation";

type MutableSessionHandler = (session: DesktopCloudSession | null) => void | Promise<void>;

export type DesktopCloudAccessDataState = {
  scopes: DesktopCloudScope[];
  scopeRows: DesktopCloudScope[];
  connectors: DesktopCloudConnector[];
  connectorsByScope: Map<string, DesktopCloudConnector[]>;
  mcpEndpoints: DesktopCloudMcpEndpoint[];
  mcpEndpointsByScope: Map<string, DesktopCloudMcpEndpoint[]>;
  accessRows: CloudAccessSurfaceRow[];
  identity: DesktopCloudRepoIdentity | null;
  loading: boolean;
  error: CloudMessageDescriptor | null;
  warning: CloudMessageDescriptor | null;
  reload: () => Promise<void>;
};

type RawCloudAccessData = {
  scopes: DesktopCloudScope[];
  connectors: DesktopCloudConnector[];
  mcpEndpoints: DesktopCloudMcpEndpoint[];
  identity: DesktopCloudRepoIdentity | null;
};

type CloudAccessInternalState = RawCloudAccessData & {
  contextKey: string | null;
  loading: boolean;
  error: CloudMessageDescriptor | null;
  warning: CloudMessageDescriptor | null;
};

export function useDesktopCloudAccessData({
  projectId,
  cloudSession,
  apiBaseUrl,
  onCloudSessionChange,
}: {
  projectId: string | null;
  cloudSession: DesktopCloudSession | null;
  apiBaseUrl: string | null;
  onCloudSessionChange: MutableSessionHandler;
}): DesktopCloudAccessDataState {
  const canLoad = Boolean(cloudSession && projectId);
  const contextKey = createCloudAccessContextKey({
    cloudSession,
    projectId,
    apiBaseUrl,
  });
  const [state, setState] = useState<CloudAccessInternalState>(() => createCloudAccessState());
  const activeRequestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = activeRequestRef.current + 1;
    activeRequestRef.current = requestId;

    if (!cloudSession || !projectId) {
      setState(createCloudAccessState({ contextKey }));
      return;
    }

    setState((current) => (
      current.contextKey === contextKey
        ? { ...current, loading: true, error: null, warning: null }
        : createCloudAccessState({ contextKey, loading: true })
    ));

    try {
      const [scopesResult, connectorsResult, mcpResult, identityResult] = await Promise.allSettled([
        listCloudScopes(cloudSession, projectId, onCloudSessionChange, apiBaseUrl),
        listCloudConnectors(cloudSession, projectId, onCloudSessionChange, apiBaseUrl),
        listCloudMcpEndpoints(cloudSession, projectId, onCloudSessionChange, apiBaseUrl),
        getCloudRepoIdentity(cloudSession, projectId, onCloudSessionChange, apiBaseUrl),
      ]);
      if (activeRequestRef.current !== requestId) return;

      const failures = [scopesResult, connectorsResult, mcpResult, identityResult]
        .filter((result) => result.status === "rejected");
      const allFailed = failures.length === 4;
      const firstFailure = failures[0];

      setState({
        scopes: unwrapSettled(scopesResult) ?? [],
        connectors: unwrapSettled(connectorsResult) ?? [],
        mcpEndpoints: unwrapSettled(mcpResult) ?? [],
        identity: unwrapSettled(identityResult),
        contextKey,
        loading: false,
        error: allFailed && firstFailure?.status === "rejected"
          ? cloudMessage("access-load-failed", undefined, getErrorDetail(firstFailure.reason))
          : null,
        warning: !allFailed && failures.length > 0
          ? cloudMessage("access-partial")
          : null,
      });
    } catch (loadError) {
      if (activeRequestRef.current !== requestId) return;
      setState(createCloudAccessState({
        contextKey,
        error: cloudMessage("access-load-failed", undefined, getErrorDetail(loadError)),
      }));
    }
  }, [apiBaseUrl, cloudSession, contextKey, onCloudSessionChange, projectId]);

  useEffect(() => {
    void load();
    return () => {
      activeRequestRef.current += 1;
    };
  }, [load]);

  const visibleState = state.contextKey === contextKey
    ? state
    : createCloudAccessState({ contextKey, loading: canLoad });

  const scopeRows = useMemo(
    () => getCloudScopeRows(visibleState.scopes, visibleState.identity),
    [visibleState.identity, visibleState.scopes],
  );

  const connectorsByScope = useMemo(() => {
    const map = new Map<string, DesktopCloudConnector[]>();
    for (const connector of visibleState.connectors) {
      const list = map.get(connector.scope_id) ?? [];
      list.push(connector);
      map.set(connector.scope_id, list);
    }
    return map;
  }, [visibleState.connectors]);

  const mcpEndpointsByScope = useMemo(() => {
    const map = new Map<string, DesktopCloudMcpEndpoint[]>();
    for (const scope of scopeRows) {
      const endpoints = visibleState.mcpEndpoints.filter((endpoint) => scopeMatchesMcpEndpoint(scope, endpoint));
      map.set(scope.id, endpoints);
    }
    return map;
  }, [visibleState.mcpEndpoints, scopeRows]);

  const accessRows = useMemo(() => buildDesktopCloudAccessRows({
    scopeRows,
    connectors: visibleState.connectors,
    mcpEndpoints: visibleState.mcpEndpoints,
    identity: visibleState.identity,
    apiBaseUrl,
  }), [apiBaseUrl, scopeRows, visibleState.connectors, visibleState.identity, visibleState.mcpEndpoints]);

  return {
    scopes: visibleState.scopes,
    scopeRows,
    connectors: visibleState.connectors,
    connectorsByScope,
    mcpEndpoints: visibleState.mcpEndpoints,
    mcpEndpointsByScope,
    accessRows,
    identity: visibleState.identity,
    loading: visibleState.loading,
    error: visibleState.error,
    warning: visibleState.warning,
    reload: load,
  };
}

function createCloudAccessState(
  overrides: Partial<CloudAccessInternalState> = {},
): CloudAccessInternalState {
  return {
    scopes: [],
    connectors: [],
    mcpEndpoints: [],
    identity: null,
    contextKey: null,
    loading: false,
    error: null,
    warning: null,
    ...overrides,
  };
}

function createCloudAccessContextKey({
  cloudSession,
  projectId,
  apiBaseUrl,
}: {
  cloudSession: DesktopCloudSession | null;
  projectId: string | null;
  apiBaseUrl: string | null;
}) {
  if (!cloudSession || !projectId) return `disabled:${projectId ?? "none"}`;
  return [
    cloudSession.user_id,
    cloudSession.session_generation,
    cloudSession.api_base_url,
    apiBaseUrl ?? "",
    projectId,
  ].join("\n");
}

function getErrorDetail(error: unknown) {
  return error instanceof Error ? error.message : undefined;
}
