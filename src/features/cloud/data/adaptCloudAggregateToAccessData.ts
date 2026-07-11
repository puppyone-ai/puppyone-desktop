import type {
  DesktopCloudConnector,
  DesktopCloudMcpEndpoint,
  DesktopCloudRepoIdentity,
  DesktopCloudScope,
} from "../../../lib/cloudApi";
import { buildDesktopCloudAccessRows } from "../sections/access/accessRows";
import { getCloudScopeRows, scopeMatchesMcpEndpoint } from "../utils";
import type { DesktopCloudAccessDataState } from "./useDesktopCloudAccessData";

/** Adapt aggregate Cloud project details into Access/Automation view state without refetching. */
export function adaptCloudAggregateToAccessData({
  apiBaseUrl,
  scopes,
  connectors,
  mcpEndpoints,
  identity,
  loading,
  error,
  warning,
  reload,
}: {
  apiBaseUrl: string | null;
  scopes: DesktopCloudScope[];
  connectors: DesktopCloudConnector[];
  mcpEndpoints: DesktopCloudMcpEndpoint[];
  identity: DesktopCloudRepoIdentity | null;
  loading: boolean;
  error: string | null;
  warning: string | null;
  reload: () => Promise<void>;
}): DesktopCloudAccessDataState {
  const scopeRows = getCloudScopeRows(scopes, identity);
  const connectorsByScope = new Map<string, DesktopCloudConnector[]>();
  for (const connector of connectors) {
    const list = connectorsByScope.get(connector.scope_id) ?? [];
    list.push(connector);
    connectorsByScope.set(connector.scope_id, list);
  }
  const mcpEndpointsByScope = new Map<string, DesktopCloudMcpEndpoint[]>();
  for (const scope of scopeRows) {
    mcpEndpointsByScope.set(
      scope.id,
      mcpEndpoints.filter((endpoint) => scopeMatchesMcpEndpoint(scope, endpoint)),
    );
  }

  return {
    scopes,
    scopeRows,
    connectors,
    connectorsByScope,
    mcpEndpoints,
    mcpEndpointsByScope,
    accessRows: buildDesktopCloudAccessRows({
      scopeRows,
      connectors,
      mcpEndpoints,
      identity,
      apiBaseUrl,
    }),
    identity,
    loading,
    error,
    warning,
    reload,
  };
}
