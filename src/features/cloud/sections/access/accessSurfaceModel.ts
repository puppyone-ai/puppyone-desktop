import type {
  DesktopCloudConnector,
  DesktopCloudMcpEndpoint,
  DesktopCloudRepoIdentity,
  DesktopCloudScope,
} from "../../../../lib/cloudApi";
import { buildCloudAccessSurfaces } from "../../model";
import type { CloudAccessSurface } from "../../model";
import {
  getApiBaseFromGitUrl,
  getCanonicalScopeGitUrl,
  getScopeIdentifierName,
  getScopePathLabel,
  normalizeProviderKey,
  profileSlug,
  scopeMatchesMcpEndpoint,
  shellQuote,
} from "../../utils";

export type DesktopCloudAccessSurfaceOptions = {
  scope: DesktopCloudScope;
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
  const scopeConnectors = connectors.filter((connector) => connector.scope_id === scope.id);
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
  scope: DesktopCloudScope;
  identity: DesktopCloudRepoIdentity | null;
  apiBaseUrl: string | null;
}) {
  const apiBase = identity?.url ? getApiBaseFromGitUrl(identity.url) : apiBaseUrl ?? "";
  const scopeName = getScopeIdentifierName(scope);
  const profileName = profileSlug(scopeName);
  const gitUrl = getCanonicalScopeGitUrl(identity, scope, apiBase);
  const cliCommand = scope.access_key && apiBase
    ? `printf '%s' ${shellQuote(scope.access_key)} | puppyone ap login ${shellQuote(profileName)} --api-url ${shellQuote(apiBase)} --access-key-stdin`
    : "";

  return {
    apiBase,
    scopeName,
    profileName,
    gitUrl,
    cliCommand,
  };
}

export function ensureDesktopMcpSurface(scope: DesktopCloudScope, surfaces: CloudAccessSurface[]): CloudAccessSurface[] {
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

export function ensureDesktopVmSurface(scope: DesktopCloudScope, surfaces: CloudAccessSurface[]): CloudAccessSurface[] {
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

export function maskDesktopScopeAccessKey(accessKey: string) {
  const [prefix, rest = ""] = accessKey.split("_", 2);
  const suffix = rest.slice(-4);
  if (!prefix || !suffix) return "••••";
  return `${prefix}_••••••••${suffix}`;
}
