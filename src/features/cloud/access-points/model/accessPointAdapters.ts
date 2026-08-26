import type {
  DesktopCloudConnector,
  DesktopCloudMcpEndpoint,
  DesktopCloudRepoIdentity,
  DesktopCloudRepositoryView,
  DesktopCloudScope,
} from "../../../../lib/cloudApi";
import { repositoryTargetKey, sameRepositoryTarget } from "../../repositoryTarget";
import {
  getApiBaseFromGitUrl,
  getCanonicalGitUrlForView,
  getCloudScopeRows,
  getScopeIdentifierName,
  getScopePathLabel,
  profileSlug,
  scopeMatchesMcpEndpoint,
  shellQuote,
} from "../../utils";
import type {
  AccessPoint,
  AccessPointCatalogKind,
  AccessPointKind,
  AccessPointRow,
} from "./accessPoint";
import { normalizeAccessPointStatus } from "./accessPoint";
import { resolveAccessPointKind } from "./accessPointKindRegistry";

export type AccessPointProjection = Readonly<{
  scopeRows: DesktopCloudRepositoryView[];
  connectorsByTarget: Map<string, DesktopCloudConnector[]>;
  mcpEndpointsByTarget: Map<string, DesktopCloudMcpEndpoint[]>;
  accessPointRows: AccessPointRow[];
}>;

export type AccessPointAdapterOptions = Readonly<{
  scope: DesktopCloudRepositoryView;
  connectors: DesktopCloudConnector[];
  mcpEndpoints: DesktopCloudMcpEndpoint[];
  identity: DesktopCloudRepoIdentity | null;
  apiBaseUrl: string | null;
  placeholderKinds?: readonly AccessPointKind[];
}>;

export function buildAccessPointProjection({
  scopes,
  connectors,
  mcpEndpoints,
  identity,
  apiBaseUrl,
  catalogKind = "all",
}: {
  scopes: DesktopCloudScope[];
  connectors: DesktopCloudConnector[];
  mcpEndpoints: DesktopCloudMcpEndpoint[];
  identity: DesktopCloudRepoIdentity | null;
  apiBaseUrl: string | null;
  catalogKind?: AccessPointCatalogKind;
}): AccessPointProjection {
  const scopeRows = getCloudScopeRows(scopes, identity);
  const connectorsByTarget = groupConnectorsByTarget(connectors);
  const mcpEndpointsByTarget = groupMcpEndpointsByTarget(scopeRows, mcpEndpoints);
  return {
    scopeRows,
    connectorsByTarget,
    mcpEndpointsByTarget,
    accessPointRows: buildAccessPointRows({
      scopeRows,
      connectors,
      mcpEndpoints,
      identity,
      apiBaseUrl,
      placeholderKinds: catalogKind === "mcp" ? ["mcp"] : [],
    }),
  };
}

export function buildAccessPointRows({
  scopeRows,
  connectors,
  mcpEndpoints,
  identity,
  apiBaseUrl,
  placeholderKinds = [],
}: {
  scopeRows: DesktopCloudRepositoryView[];
  connectors: DesktopCloudConnector[];
  mcpEndpoints: DesktopCloudMcpEndpoint[];
  identity: DesktopCloudRepoIdentity | null;
  apiBaseUrl: string | null;
  placeholderKinds?: readonly AccessPointKind[];
}): AccessPointRow[] {
  return scopeRows.flatMap((scope): AccessPointRow[] => (
    buildAccessPointsForScope({
      scope,
      connectors,
      mcpEndpoints,
      identity,
      apiBaseUrl,
      placeholderKinds,
    }).map((accessPoint) => ({
      id: `${scope.id}:${accessPoint.id}`,
      scope,
      accessPoint,
    }))
  ));
}

export function buildAccessPointsForScope({
  scope,
  connectors,
  mcpEndpoints,
  identity,
  apiBaseUrl,
  placeholderKinds = [],
}: AccessPointAdapterOptions): AccessPoint[] {
  const context = getAccessPointContext({ scope, identity, apiBaseUrl });
  const scopeConnectors = connectors.filter((connector) => sameRepositoryTarget(connector.target, scope.target));
  const scopeMcpEndpoints = mcpEndpoints.filter((endpoint) => scopeMatchesMcpEndpoint(scope, endpoint));
  const cliConnector = scopeConnectors.find((connector) => resolveAccessPointKind(connector.provider) === "cli");
  const gitConnector = scopeConnectors.find((connector) => resolveAccessPointKind(connector.provider) === "git");
  const accessPoints: AccessPoint[] = [
    {
      id: `builtin:cli:${scope.id}`,
      kind: "cli",
      sourceProvider: "cli",
      title: "",
      subtitle: "",
      status: normalizeAccessPointStatus(cliConnector?.status),
      connector: cliConnector,
      commands: [
        { id: "login", value: context.cliCommand, disabled: !context.cliCommand },
        {
          id: "explore",
          value: `puppyone fs tree / --profile ${shellQuote(context.profileName)}\npuppyone fs ls / --profile ${shellQuote(context.profileName)}`,
          disabled: !context.cliCommand,
        },
      ],
    },
    {
      id: `builtin:git:${scope.id}`,
      kind: "git",
      sourceProvider: gitConnector?.provider ?? "git",
      title: "",
      subtitle: "",
      status: normalizeAccessPointStatus(gitConnector?.status ?? (context.gitUrl ? "active" : "missing")),
      connector: gitConnector,
      commands: [
        {
          id: "existing-folder",
          value: `git remote add puppyone ${context.gitUrl || "<git-url>"}\ngit fetch puppyone`,
          disabled: !context.gitUrl,
        },
        {
          id: "clone",
          value: `git clone ${context.gitUrl || "<git-url>"} ${shellQuote(context.scopeName)}`,
          disabled: !context.gitUrl,
        },
      ],
    },
    ...scopeMcpEndpoints.map((endpoint): AccessPoint => {
      const accessLabel = endpoint.accesses?.length
        ? endpoint.accesses.map((access) => access.path || "/").join(", ")
        : endpoint.path || "/";
      const serverUrl = endpoint.api_key && context.apiBase
        ? `${context.apiBase}/api/v1/mcp/server/${endpoint.api_key}`
        : "";
      return {
        id: `mcp:${endpoint.id}`,
        kind: "mcp",
        sourceProvider: "mcp",
        title: endpoint.name || "",
        subtitle: accessLabel,
        status: normalizeAccessPointStatus(endpoint.status || "active"),
        endpoint,
        commands: serverUrl ? [{ id: "server-url", value: serverUrl }] : [],
      };
    }),
  ];

  return placeholderKinds.reduce(
    (points, kind) => ensureAccessPointPlaceholder(scope, points, kind),
    accessPoints,
  );
}

export function getAccessPointContext({
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
  return { apiBase, scopeName, profileName, gitUrl, cliCommand };
}

export function isAccessPointPlaceholder(accessPoint: AccessPoint): boolean {
  return accessPoint.placeholder === true;
}

export function isMcpAccessPointPlaceholder(accessPoint: AccessPoint): boolean {
  return accessPoint.placeholder === true && accessPoint.kind === "mcp";
}

export function isVmAccessPointPlaceholder(accessPoint: AccessPoint): boolean {
  return accessPoint.placeholder === true && accessPoint.kind === "vm";
}

export function isAccessPointNavigationResource(row: AccessPointRow): boolean {
  return row.accessPoint.kind !== "custom";
}

function ensureAccessPointPlaceholder(
  scope: DesktopCloudRepositoryView,
  accessPoints: AccessPoint[],
  kind: AccessPointKind,
): AccessPoint[] {
  if (accessPoints.some((accessPoint) => accessPoint.kind === kind)) return accessPoints;
  if (kind !== "mcp" && kind !== "vm") return accessPoints;
  return [
    ...accessPoints,
    {
      id: `placeholder:${kind}:${scope.id}`,
      kind,
      sourceProvider: kind,
      title: "",
      subtitle: getScopePathLabel(scope),
      status: normalizeAccessPointStatus("missing"),
      placeholder: true,
    },
  ];
}

function groupConnectorsByTarget(connectors: DesktopCloudConnector[]) {
  const groups = new Map<string, DesktopCloudConnector[]>();
  for (const connector of connectors) {
    const key = repositoryTargetKey(connector.target);
    const group = groups.get(key) ?? [];
    group.push(connector);
    groups.set(key, group);
  }
  return groups;
}

function groupMcpEndpointsByTarget(
  scopeRows: DesktopCloudRepositoryView[],
  mcpEndpoints: DesktopCloudMcpEndpoint[],
) {
  const groups = new Map<string, DesktopCloudMcpEndpoint[]>();
  for (const scope of scopeRows) {
    groups.set(
      repositoryTargetKey(scope.target),
      mcpEndpoints.filter((endpoint) => scopeMatchesMcpEndpoint(scope, endpoint)),
    );
  }
  return groups;
}
