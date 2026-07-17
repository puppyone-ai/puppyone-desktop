import type {
  DesktopCloudConnector,
  DesktopCloudMcpEndpoint,
  DesktopCloudRepoIdentity,
  DesktopCloudScope,
} from "../../../lib/cloudApi";
import { buildDesktopCloudAccessRows } from "../sections/access/accessRows";
import { getCloudScopeRows, scopeMatchesMcpEndpoint } from "../utils";
import type { DesktopCloudAccessDataState } from "./useDesktopCloudAccessData";
import type { CloudMessageDescriptor } from "../cloudPresentation";
import { repositoryTargetKey } from "../repositoryTarget";

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
  error: CloudMessageDescriptor | null;
  warning: CloudMessageDescriptor | null;
  reload: () => Promise<void>;
}): DesktopCloudAccessDataState {
  const scopeRows = getCloudScopeRows(scopes, identity);
  const connectorsByTarget = new Map<string, DesktopCloudConnector[]>();
  for (const connector of connectors) {
    const key = repositoryTargetKey(connector.target);
    const list = connectorsByTarget.get(key) ?? [];
    list.push(connector);
    connectorsByTarget.set(key, list);
  }
  const mcpEndpointsByTarget = new Map<string, DesktopCloudMcpEndpoint[]>();
  for (const scope of scopeRows) {
    mcpEndpointsByTarget.set(
      repositoryTargetKey(scope.target),
      mcpEndpoints.filter((endpoint) => scopeMatchesMcpEndpoint(scope, endpoint)),
    );
  }

  return {
    scopes,
    scopeRows,
    connectors,
    connectorsByTarget,
    mcpEndpoints,
    mcpEndpointsByTarget,
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
