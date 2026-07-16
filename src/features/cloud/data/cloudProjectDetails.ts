import {
  getCloudDashboard,
  getCloudProjectReadiness,
  getCloudRepoIdentity,
  listCloudConnectors,
  listCloudMcpEndpoints,
  listCloudRoot,
  listCloudScopes,
  type DesktopCloudConnector,
  type DesktopCloudDashboard,
  type DesktopCloudMcpEndpoint,
  type DesktopCloudProject,
  type DesktopCloudProjectReadiness,
  type DesktopCloudRepoIdentity,
  type DesktopCloudScope,
  type DesktopCloudSession,
  type DesktopCloudTree,
} from "../../../lib/cloudApi";
import {
  getCloudHistory,
  type DesktopCloudHistory,
} from "../../../lib/cloudHistoryApi";
import { unwrapSettled } from "../utils";
import { cloudMessage, type CloudMessageDescriptor } from "../cloudPresentation";

export type CloudProjectDetailsData = {
  activeProject: DesktopCloudProject | null;
  dashboard: DesktopCloudDashboard | null;
  tree: DesktopCloudTree | null;
  history: DesktopCloudHistory | null;
  scopes: DesktopCloudScope[];
  connectors: DesktopCloudConnector[];
  mcpEndpoints: DesktopCloudMcpEndpoint[];
  identity: DesktopCloudRepoIdentity | null;
  readiness: DesktopCloudProjectReadiness | null;
  warning: CloudMessageDescriptor | null;
};

export const CLOUD_PROJECT_DETAIL_RESOURCES = [
  "dashboard",
  "tree",
  "history",
  "scopes",
  "connectors",
  "mcp-endpoints",
  "identity",
  "readiness",
] as const;

export type CloudProjectDetailResource = (typeof CLOUD_PROJECT_DETAIL_RESOURCES)[number];

export async function loadCloudProjectDetails({
  session,
  projectId,
  projects,
  onSessionChange,
  cloudApiBaseUrl,
  resources = CLOUD_PROJECT_DETAIL_RESOURCES,
}: {
  session: DesktopCloudSession;
  projectId: string;
  projects: DesktopCloudProject[];
  onSessionChange: (session: DesktopCloudSession | null) => void;
  cloudApiBaseUrl: string | null;
  resources?: readonly CloudProjectDetailResource[];
}): Promise<CloudProjectDetailsData> {
  const requested = new Set(resources);
  const [
    dashboardResult,
    treeResult,
    historyResult,
    scopesResult,
    connectorsResult,
    mcpResult,
    identityResult,
    readinessResult,
  ] = await Promise.allSettled([
    requested.has("dashboard")
      ? getCloudDashboard(session, projectId, onSessionChange, cloudApiBaseUrl)
      : Promise.resolve(null),
    requested.has("tree")
      ? listCloudRoot(session, projectId, onSessionChange, cloudApiBaseUrl)
      : Promise.resolve(null),
    requested.has("history")
      ? getCloudHistory(session, projectId, 20, onSessionChange, cloudApiBaseUrl)
      : Promise.resolve(null),
    requested.has("scopes")
      ? listCloudScopes(session, projectId, onSessionChange, cloudApiBaseUrl)
      : Promise.resolve(null),
    requested.has("connectors")
      ? listCloudConnectors(session, projectId, onSessionChange, cloudApiBaseUrl)
      : Promise.resolve(null),
    requested.has("mcp-endpoints")
      ? listCloudMcpEndpoints(session, projectId, onSessionChange, cloudApiBaseUrl)
      : Promise.resolve(null),
    requested.has("identity")
      ? getCloudRepoIdentity(session, projectId, onSessionChange, cloudApiBaseUrl)
      : Promise.resolve(null),
    requested.has("readiness")
      ? getCloudProjectReadiness(session, projectId, onSessionChange, cloudApiBaseUrl)
      : Promise.resolve(null),
  ]);

  const dashboard = unwrapSettled(dashboardResult);
  const activeProject = projects.find((project) => project.id === projectId) ?? (
    dashboard?.project
      ? { id: dashboard.project.id, name: dashboard.project.name, description: dashboard.project.description ?? null }
      : null
  );
  const sectionErrors = [
    ["dashboard", dashboardResult],
    ["tree", treeResult],
    ["history", historyResult],
    ["scopes", scopesResult],
    ["connectors", connectorsResult],
    ["mcp-endpoints", mcpResult],
    ["identity", identityResult],
    ["readiness", readinessResult],
  ].filter(([resource, result]) => requested.has(resource as CloudProjectDetailResource)
    && (result as PromiseSettledResult<unknown>).status === "rejected");

  return {
    activeProject,
    dashboard,
    tree: unwrapSettled(treeResult),
    history: unwrapSettled(historyResult),
    scopes: unwrapSettled(scopesResult) ?? [],
    connectors: unwrapSettled(connectorsResult) ?? [],
    mcpEndpoints: unwrapSettled(mcpResult) ?? [],
    identity: unwrapSettled(identityResult),
    readiness: unwrapSettled(readinessResult),
    warning: sectionErrors.length > 0 ? cloudMessage("project-details-partial") : null,
  };
}
