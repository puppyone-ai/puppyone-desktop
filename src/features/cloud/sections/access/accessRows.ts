import type {
  DesktopCloudConnector,
  DesktopCloudMcpEndpoint,
  DesktopCloudRepoIdentity,
  DesktopCloudScope,
} from "../../../../lib/cloudApi";
import type { CloudAccessFilter } from "../../accessFilters";
import type { CloudAccessSurface } from "../../model";
import {
  isCloudIntegrationConnector,
  normalizeProviderKey,
} from "../../utils";
import {
  buildDesktopCloudAccessSurfacesForScope,
  isCliAccessSurface,
  isGitAccessSurface,
  isMcpAccessSurface,
  isVmAccessSurface,
} from "./accessSurfaceModel";

export type CloudAccessSurfaceRow = {
  id: string;
  scope: DesktopCloudScope;
  surface: CloudAccessSurface;
};

export function buildDesktopCloudAccessRows({
  scopeRows,
  connectors,
  mcpEndpoints,
  identity,
  apiBaseUrl,
  includePlaceholders = false,
}: {
  scopeRows: DesktopCloudScope[];
  connectors: DesktopCloudConnector[];
  mcpEndpoints: DesktopCloudMcpEndpoint[];
  identity: DesktopCloudRepoIdentity | null;
  apiBaseUrl: string | null;
  includePlaceholders?: boolean;
}): CloudAccessSurfaceRow[] {
  return scopeRows.flatMap((scope): CloudAccessSurfaceRow[] => {
    const surfaces = buildDesktopCloudAccessSurfacesForScope({
      scope,
      connectors,
      mcpEndpoints,
      identity,
      apiBaseUrl,
      includePlaceholders,
    });

    return surfaces.map((surface) => ({
      id: `${scope.id}:${surface.id}`,
      scope,
      surface,
    }));
  });
}

export function isCloudAccessNavigationResource(row: CloudAccessSurfaceRow) {
  const provider = row.surface.provider;
  return (
    isCliAccessSurface(provider) ||
    isGitAccessSurface(provider) ||
    isMcpAccessSurface(provider) ||
    isVmAccessSurface(provider)
  );
}

export function cloudAccessRowMatchesFilter(row: CloudAccessSurfaceRow, filter: CloudAccessFilter): boolean {
  const provider = normalizeProviderKey(row.surface.provider);
  if (filter === "all") return true;
  if (filter === "cli") return provider === "cli";
  if (filter === "git") return provider === "filesystem" || provider === "git" || provider === "git_remote";
  if (filter === "mcp") return provider === "mcp" || provider === "mcp_endpoint";
  if (filter === "integrations") {
    return !!row.surface.connector && isCloudIntegrationConnector(row.surface.connector);
  }
  return true;
}

export function cloudAccessRowMatchesIntegrationProvider(
  row: CloudAccessSurfaceRow,
  providerFilter: string | null,
): boolean {
  if (!providerFilter) return true;
  const rowProvider = normalizeProviderKey(row.surface.connector?.provider ?? row.surface.provider);
  return rowProvider === normalizeProviderKey(providerFilter);
}
