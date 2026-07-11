import type {
  DesktopCloudConnector,
  DesktopCloudScope,
} from "../../lib/cloudApi";

export type CloudAutomationRow = {
  id: string;
  scope: DesktopCloudScope;
  connector: DesktopCloudConnector;
};

/**
 * Cloud Automation owns third-party information-source connectors.
 * Built-in access transports are deliberately excluded from this domain.
 */
const NON_AUTOMATION_CONNECTOR_PROVIDERS = new Set([
  "",
  "agent",
  "cli",
  "filesystem",
  "git",
  "git_remote",
  "mcp",
  "mcp_endpoint",
  "sandbox",
  "sandbox_endpoint",
  "sync",
]);

export function normalizeAutomationProviderKey(provider: string) {
  return provider.trim().toLowerCase().replace(/-/g, "_");
}

export function isCloudAutomationConnector(connector: DesktopCloudConnector) {
  return !NON_AUTOMATION_CONNECTOR_PROVIDERS.has(
    normalizeAutomationProviderKey(connector.provider),
  );
}

export function buildCloudAutomationRows({
  scopes,
  connectors,
}: {
  scopes: DesktopCloudScope[];
  connectors: DesktopCloudConnector[];
}): CloudAutomationRow[] {
  const scopeById = new Map(scopes.map((scope) => [scope.id, scope]));
  return connectors.flatMap((connector) => {
    if (!isCloudAutomationConnector(connector)) return [];
    const scope = scopeById.get(connector.scope_id);
    if (!scope) return [];
    return [{
      id: `automation:${scope.id}:${connector.id}`,
      scope,
      connector,
    }];
  });
}

export function cloudAutomationRowMatchesProvider(
  row: CloudAutomationRow,
  providerFilter: string | null,
) {
  if (!providerFilter) return true;
  const rowProvider = normalizeAutomationProviderKey(row.connector.provider);
  return rowProvider === normalizeAutomationProviderKey(providerFilter);
}

/** The Cloud web app still exposes its established workflow route. */
export function getCloudAutomationWebPath(projectId: string) {
  return `/projects/${encodeURIComponent(projectId)}/workflows`;
}
