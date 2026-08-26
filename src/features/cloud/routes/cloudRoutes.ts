import { Clock3, Cloud, CreditCard, FileText, GitBranch, Grid2X2, Settings, ShieldCheck, SquareTerminal, Users } from "lucide-react";
import type { MessageFormatter } from "@puppyone/localization/core";
import { getCloudAutomationWebPath } from "../../automation/automationDomain";
import type { CloudProjectDetailResource } from "../data/cloudProjectDetails";
import type { CloudWorkspaceSection } from "./cloudRouteIds";

export type CloudRouteContext = "initialization" | "project" | "organization";
export type CloudRouteSurface = "standard" | "landing" | "history" | "automation";

export type CloudRouteDescriptor = {
  id: CloudWorkspaceSection;
  labelId: string;
  titleId: string;
  descriptionId: string;
  icon: typeof Cloud;
  context: CloudRouteContext;
  surface: CloudRouteSurface;
  resources: readonly CloudProjectDetailResource[];
  showInSidebar: boolean;
  requiredCapability?: string;
  webPath: (projectId?: string) => string;
};

const NO_PROJECT_RESOURCES = [] as const satisfies readonly CloudProjectDetailResource[];
const OVERVIEW_PROJECT_RESOURCES = [
  "dashboard",
  "history",
  "scopes",
  "connectors",
  "mcp-endpoints",
  "identity",
] as const satisfies readonly CloudProjectDetailResource[];
const ACCESS_PROJECT_RESOURCES = [
  "scopes",
  "connectors",
  "mcp-endpoints",
  "identity",
] as const satisfies readonly CloudProjectDetailResource[];
const GIT_SYNC_PROJECT_RESOURCES = [
  "identity",
] as const satisfies readonly CloudProjectDetailResource[];

export const CLOUD_ROUTES = [
  {
    id: "initialize",
    labelId: "cloud.route.initialize.label",
    titleId: "cloud.route.initialize.title",
    descriptionId: "cloud.route.initialize.description",
    icon: Cloud,
    context: "initialization",
    surface: "standard",
    resources: NO_PROJECT_RESOURCES,
    showInSidebar: false,
    webPath: () => "/projects",
  },
  {
    id: "cloud-team",
    labelId: "cloud.route.cloud-team.label",
    titleId: "cloud.route.cloud-team.title",
    descriptionId: "cloud.route.cloud-team.description",
    icon: Users,
    context: "organization",
    surface: "standard",
    resources: NO_PROJECT_RESOURCES,
    showInSidebar: true,
    webPath: () => "/team",
  },
  {
    id: "cloud-billing",
    labelId: "cloud.route.cloud-billing.label",
    titleId: "cloud.route.cloud-billing.title",
    descriptionId: "cloud.route.cloud-billing.description",
    icon: CreditCard,
    context: "organization",
    surface: "standard",
    resources: NO_PROJECT_RESOURCES,
    showInSidebar: true,
    webPath: () => "/billing",
  },
  {
    id: "contents",
    labelId: "cloud.route.contents.label",
    titleId: "cloud.route.contents.title",
    descriptionId: "cloud.route.contents.description",
    icon: FileText,
    context: "project",
    surface: "landing",
    resources: OVERVIEW_PROJECT_RESOURCES,
    showInSidebar: true,
    webPath: (projectId?: string) => `/projects/${requireProjectId(projectId)}/data`,
  },
  {
    id: "mcp-cli",
    labelId: "cloud.route.mcp-cli.label",
    titleId: "cloud.route.mcp-cli.title",
    descriptionId: "cloud.route.mcp-cli.description",
    icon: SquareTerminal,
    context: "project",
    surface: "landing",
    resources: ACCESS_PROJECT_RESOURCES,
    showInSidebar: true,
    webPath: (projectId?: string) => `/projects/${requireProjectId(projectId)}/access`,
  },
  {
    id: "history",
    labelId: "cloud.route.history.label",
    titleId: "cloud.route.history.title",
    descriptionId: "cloud.route.history.description",
    icon: Clock3,
    context: "project",
    surface: "history",
    resources: NO_PROJECT_RESOURCES,
    showInSidebar: false,
    webPath: (projectId?: string) => `/projects/${requireProjectId(projectId)}/changes`,
  },
  {
    id: "branches",
    labelId: "cloud.route.branches.label",
    titleId: "cloud.route.branches.title",
    descriptionId: "cloud.route.branches.description",
    icon: GitBranch,
    context: "project",
    surface: "standard",
    resources: NO_PROJECT_RESOURCES,
    showInSidebar: false,
    webPath: (projectId?: string) => `/projects/${requireProjectId(projectId)}/changes`,
  },
  {
    id: "automation",
    labelId: "cloud.route.automation.label",
    titleId: "cloud.route.automation.title",
    descriptionId: "cloud.route.automation.description",
    icon: Grid2X2,
    context: "project",
    surface: "automation",
    resources: ACCESS_PROJECT_RESOURCES,
    showInSidebar: true,
    webPath: (projectId?: string) => getCloudAutomationWebPath(requireProjectId(projectId)),
  },
  {
    id: "access",
    labelId: "cloud.route.access.label",
    titleId: "cloud.route.access.title",
    descriptionId: "cloud.route.access.description",
    icon: ShieldCheck,
    context: "project",
    surface: "landing",
    resources: ACCESS_PROJECT_RESOURCES,
    showInSidebar: true,
    webPath: (projectId?: string) => `/projects/${requireProjectId(projectId)}/access`,
  },
  {
    id: "git-sync",
    labelId: "cloud.route.git-sync.label",
    titleId: "cloud.route.git-sync.title",
    descriptionId: "cloud.route.git-sync.description",
    icon: GitBranch,
    context: "project",
    surface: "landing",
    resources: GIT_SYNC_PROJECT_RESOURCES,
    showInSidebar: false,
    webPath: (projectId?: string) => `/projects/${requireProjectId(projectId)}/access`,
  },
  {
    id: "team",
    labelId: "cloud.route.team.label",
    titleId: "cloud.route.team.title",
    descriptionId: "cloud.route.team.description",
    icon: Users,
    context: "project",
    surface: "standard",
    resources: NO_PROJECT_RESOURCES,
    showInSidebar: false,
    webPath: (projectId?: string) => `/projects/${requireProjectId(projectId)}/settings`,
    requiredCapability: "project.settings.manage",
  },
  {
    id: "settings",
    labelId: "cloud.route.settings.label",
    titleId: "cloud.route.settings.title",
    descriptionId: "cloud.route.settings.description",
    icon: Settings,
    context: "project",
    surface: "landing",
    resources: NO_PROJECT_RESOURCES,
    showInSidebar: false,
    requiredCapability: "project.settings.manage",
    webPath: (projectId?: string) => `/projects/${requireProjectId(projectId)}/settings`,
  },
] as const satisfies readonly CloudRouteDescriptor[];

const CLOUD_ROUTE_BY_ID = new Map<CloudWorkspaceSection, CloudRouteDescriptor>(
  CLOUD_ROUTES.map((route) => [route.id, route]),
);

export const CLOUD_ORGANIZATION_ROUTES = CLOUD_ROUTES.filter((route) => route.context === "organization" && route.showInSidebar);
export const CLOUD_PROJECT_ROUTES = CLOUD_ROUTES.filter((route) => route.context === "project");
const CLOUD_PROJECT_SIDEBAR_ORDER: readonly CloudWorkspaceSection[] = [
  "mcp-cli",
  "automation",
  "contents",
  "access",
];
export const CLOUD_PROJECT_SIDEBAR_ROUTES = CLOUD_PROJECT_ROUTES
  .filter((route) => route.showInSidebar)
  .sort((left, right) => (
    CLOUD_PROJECT_SIDEBAR_ORDER.indexOf(left.id)
    - CLOUD_PROJECT_SIDEBAR_ORDER.indexOf(right.id)
  ));
/** Stable repository-context shell: current Project sections + Organization destinations. */
export const CLOUD_BOUND_PROJECT_SIDEBAR_ROUTES = [
  ...CLOUD_PROJECT_SIDEBAR_ROUTES,
  ...CLOUD_ORGANIZATION_ROUTES,
];

export function normalizeCloudSection(
  section: CloudWorkspaceSection | string,
): CloudWorkspaceSection {
  if (section === "git-sync") return "access";
  return CLOUD_ROUTE_BY_ID.has(section as CloudWorkspaceSection)
    ? section as CloudWorkspaceSection
    : "contents";
}

/** Use the primary product capability as the first signed-out Cloud destination. */
export function getCloudSignedOutSection(
  section: CloudWorkspaceSection | string,
): CloudWorkspaceSection {
  const normalizedSection = normalizeCloudSection(section);
  return normalizedSection === "initialize" ? "mcp-cli" : normalizedSection;
}

/**
 * Low-frequency Project detail routes remain addressable without becoming
 * first-class navigation destinations. History and Project Settings are
 * drill-downs from Overview, so Overview stays selected on those surfaces.
 */
export function getCloudSidebarActiveSection(
  section: CloudWorkspaceSection | string,
): CloudWorkspaceSection {
  const normalizedSection = normalizeCloudSection(section);
  return ["history", "settings"].includes(normalizedSection)
    ? "contents"
    : normalizedSection;
}

export function getCloudRoute(section: CloudWorkspaceSection): CloudRouteDescriptor {
  return CLOUD_ROUTE_BY_ID.get(section) ?? CLOUD_ROUTE_BY_ID.get("contents")!;
}

export function getCloudSectionDescriptor(section: CloudWorkspaceSection, t: MessageFormatter) {
  const route = getCloudRoute(section);
  return {
    title: t(route.titleId),
    description: t(route.descriptionId),
    icon: route.icon,
  };
}

export function getCloudRouteLabel(route: CloudRouteDescriptor, t: MessageFormatter) {
  return t(route.labelId);
}

export function getCloudRouteWebPath(section: CloudWorkspaceSection, projectId?: string): string {
  return getCloudRoute(section).webPath(projectId);
}

export function getCloudRouteSurface(section: CloudWorkspaceSection): CloudRouteSurface {
  return getCloudRoute(section).surface;
}

export function getCloudProjectDetailResources(
  section: CloudWorkspaceSection,
): readonly CloudProjectDetailResource[] {
  return getCloudRoute(section).resources;
}

export function isCloudOrganizationSection(section: CloudWorkspaceSection): boolean {
  return getCloudRoute(section).context === "organization";
}

export function isCloudProjectSection(section: CloudWorkspaceSection): boolean {
  return getCloudRoute(section).context === "project";
}

function requireProjectId(projectId: string | undefined): string {
  const normalized = projectId?.trim();
  if (!normalized) {
    throw new Error("Cloud project route requires a project id.");
  }
  return normalized;
}
