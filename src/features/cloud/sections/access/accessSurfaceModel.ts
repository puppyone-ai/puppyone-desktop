import type {
  DesktopCloudConnector,
  DesktopCloudMcpEndpoint,
  DesktopCloudRepoIdentity,
  DesktopCloudRepositoryView,
} from "../../../../lib/cloudApi";
import { buildCloudAccessSurfaces } from "../../model";
import type { CloudAccessSurface } from "../../model";
import {
  getApiBaseFromGitUrl,
  getCanonicalGitUrlForView,
  getScopeIdentifierName,
  getScopePathLabel,
  normalizeProviderKey,
  profileSlug,
  scopeMatchesMcpEndpoint,
} from "../../utils";
import { sameRepositoryTarget } from "../../repositoryTarget";

export type DesktopCloudAccessSurfaceOptions = {
  scope: DesktopCloudRepositoryView;
  connectors: DesktopCloudConnector[];
  mcpEndpoints: DesktopCloudMcpEndpoint[];
  identity: DesktopCloudRepoIdentity | null;
  apiBaseUrl: string | null;
  includePlaceholders?: boolean;
};

export function buildDesktopCloudAccessSurfacesForScope({
  scope,
  connectors,
  mcpEndpoints,
  identity,
  apiBaseUrl,
  includePlaceholders = false,
}: DesktopCloudAccessSurfaceOptions): CloudAccessSurface[] {
  const context = getDesktopCloudAccessSurfaceContext({ scope, identity, apiBaseUrl });
  const scopeConnectors = connectors.filter((connector) => (
    sameRepositoryTarget(connector.target, scope.target)
  ));
  const scopeMcpEndpoints = mcpEndpoints.filter((endpoint) => scopeMatchesMcpEndpoint(scope, endpoint));
  const surfaces = buildCloudAccessSurfaces({
    scope,
    connectors: scopeConnectors,
    mcpEndpoints: scopeMcpEndpoints,
    apiBase: context.apiBase,
    gitUrl: context.gitUrl,
    cliCommand: context.cliCommand,
    profileName: context.profileName,
  });
  const surfacesWithPlaceholders = includePlaceholders
    ? ensureDesktopVmSurface(scope, ensureDesktopMcpSurface(scope, surfaces))
    : surfaces;

  return includePlaceholders
    ? surfacesWithPlaceholders
    : surfacesWithPlaceholders.filter((surface) => !isDesktopAccessPlaceholderSurface(surface));
}

export function getDesktopCloudAccessSurfaceContext({
  scope,
  identity,
  apiBaseUrl,
}: {
  scope: DesktopCloudRepositoryView;
  identity: DesktopCloudRepoIdentity | null;
  apiBaseUrl: string | null;
}) {
  const apiBase = identity?.url ? getApiBaseFromGitUrl(identity.url) : apiBaseUrl ?? "";
  const scopeName = getScopeIdentifierName(scope);
  const profileName = profileSlug(scopeName);
  const gitUrl = getCanonicalGitUrlForView(identity, scope, apiBase);
  // Target metadata never exposes shared credentials. One-time issuance is
  // owned by the dedicated credential action, not ordinary repository reads.
  const cliCommand = "";

  return {
    apiBase,
    scopeName,
    profileName,
    gitUrl,
    cliCommand,
  };
}

export function ensureDesktopMcpSurface(scope: DesktopCloudRepositoryView, surfaces: CloudAccessSurface[]): CloudAccessSurface[] {
  if (surfaces.some((surface) => isMcpAccessSurface(surface.provider))) {
    return surfaces;
  }
  return [
    ...surfaces,
    {
      id: `placeholder:mcp:${scope.id}`,
      provider: "mcp",
      title: "",
      subtitle: getScopePathLabel(scope),
      status: "missing",
    },
  ];
}

export function ensureDesktopVmSurface(scope: DesktopCloudRepositoryView, surfaces: CloudAccessSurface[]): CloudAccessSurface[] {
  if (surfaces.some((surface) => isVmAccessSurface(surface.provider))) {
    return surfaces;
  }
  return [
    ...surfaces,
    {
      id: `placeholder:vm:${scope.id}`,
      provider: "vm",
      title: "",
      subtitle: getScopePathLabel(scope),
      status: "missing",
    },
  ];
}

export function isDesktopMcpPlaceholderSurface(surface: CloudAccessSurface) {
  return surface.id.startsWith("placeholder:mcp:");
}

export function isDesktopVmPlaceholderSurface(surface: CloudAccessSurface) {
  return surface.id.startsWith("placeholder:vm:");
}

export function isDesktopAccessPlaceholderSurface(surface: CloudAccessSurface) {
  return isDesktopMcpPlaceholderSurface(surface) || isDesktopVmPlaceholderSurface(surface);
}

export function isMcpAccessSurface(provider: string) {
  const normalized = normalizeProviderKey(provider);
  return normalized === "mcp" || normalized === "mcp_endpoint";
}

export function isVmAccessSurface(provider: string) {
  const normalized = normalizeProviderKey(provider);
  return normalized === "vm" || normalized === "remote_workspace" || normalized === "sandbox";
}

export function isGitAccessSurface(provider: string) {
  const normalized = normalizeProviderKey(provider);
  return normalized === "filesystem" || normalized === "git" || normalized === "git_remote";
}

export function isCliAccessSurface(provider: string) {
  return normalizeProviderKey(provider) === "cli";
}
