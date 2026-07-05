import { useCallback, useEffect, useMemo, useState } from "react";
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
  error: string | null;
  warning: string | null;
  reload: () => Promise<void>;
};

type RawCloudAccessData = {
  scopes: DesktopCloudScope[];
  connectors: DesktopCloudConnector[];
  mcpEndpoints: DesktopCloudMcpEndpoint[];
  identity: DesktopCloudRepoIdentity | null;
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
  const [raw, setRaw] = useState<RawCloudAccessData>(() => createRawCloudAccessData());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!cloudSession || !projectId) {
      setRaw(createRawCloudAccessData());
      setLoading(false);
      setError(null);
      setWarning(null);
      return;
    }

    setLoading(true);
    setError(null);
    setWarning(null);

    const [scopesResult, connectorsResult, mcpResult, identityResult] = await Promise.allSettled([
      listCloudScopes(cloudSession, projectId, onCloudSessionChange, apiBaseUrl),
      listCloudConnectors(cloudSession, projectId, onCloudSessionChange, apiBaseUrl),
      listCloudMcpEndpoints(cloudSession, projectId, onCloudSessionChange, apiBaseUrl),
      getCloudRepoIdentity(cloudSession, projectId, onCloudSessionChange, apiBaseUrl),
    ]);

    const failures = [scopesResult, connectorsResult, mcpResult, identityResult]
      .filter((result) => result.status === "rejected");
    const allFailed = failures.length === 4;
    const firstFailure = failures[0];

    setRaw({
      scopes: unwrapSettled(scopesResult) ?? [],
      connectors: unwrapSettled(connectorsResult) ?? [],
      mcpEndpoints: unwrapSettled(mcpResult) ?? [],
      identity: unwrapSettled(identityResult),
    });
    setLoading(false);
    setError(allFailed && firstFailure?.status === "rejected"
      ? getErrorMessage(firstFailure.reason, "Unable to load Cloud access.")
      : null);
    setWarning(!allFailed && failures.length > 0
      ? "Some Cloud access details could not be loaded. Refresh after checking the backend connection."
      : null);
  }, [apiBaseUrl, cloudSession, onCloudSessionChange, projectId]);

  useEffect(() => {
    let cancelled = false;
    void load().catch((loadError) => {
      if (cancelled) return;
      setRaw(createRawCloudAccessData());
      setLoading(false);
      setError(getErrorMessage(loadError, "Unable to load Cloud access."));
      setWarning(null);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const scopeRows = useMemo(
    () => getCloudScopeRows(raw.scopes, raw.identity),
    [raw.identity, raw.scopes],
  );

  const connectorsByScope = useMemo(() => {
    const map = new Map<string, DesktopCloudConnector[]>();
    for (const connector of raw.connectors) {
      const list = map.get(connector.scope_id) ?? [];
      list.push(connector);
      map.set(connector.scope_id, list);
    }
    return map;
  }, [raw.connectors]);

  const mcpEndpointsByScope = useMemo(() => {
    const map = new Map<string, DesktopCloudMcpEndpoint[]>();
    for (const scope of scopeRows) {
      const endpoints = raw.mcpEndpoints.filter((endpoint) => scopeMatchesMcpEndpoint(scope, endpoint));
      map.set(scope.id, endpoints);
    }
    return map;
  }, [raw.mcpEndpoints, scopeRows]);

  const accessRows = useMemo(() => buildDesktopCloudAccessRows({
    scopeRows,
    connectors: raw.connectors,
    mcpEndpoints: raw.mcpEndpoints,
    identity: raw.identity,
    apiBaseUrl,
  }), [apiBaseUrl, raw.connectors, raw.identity, raw.mcpEndpoints, scopeRows]);

  return {
    scopes: raw.scopes,
    scopeRows,
    connectors: raw.connectors,
    connectorsByScope,
    mcpEndpoints: raw.mcpEndpoints,
    mcpEndpointsByScope,
    accessRows,
    identity: raw.identity,
    loading,
    error,
    warning,
    reload: load,
  };
}

function createRawCloudAccessData(): RawCloudAccessData {
  return {
    scopes: [],
    connectors: [],
    mcpEndpoints: [],
    identity: null,
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
