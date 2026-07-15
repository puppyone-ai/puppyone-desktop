import { Bot, Clock3, Cloud, CreditCard, FileText, GitBranch, Grid2X2, LayoutTemplate, Settings, ShieldCheck, SquareTerminal, Users } from "lucide-react";
import type { MessageFormatter } from "@puppyone/localization/core";
import { getCloudAutomationWebPath } from "../../automation/automationDomain";
import type { CloudWorkspaceSection } from "./cloudRouteIds";

export type CloudRouteContext = "projects" | "project" | "account";

export type CloudRouteDescriptor = {
  id: CloudWorkspaceSection;
  labelId: string;
  titleId: string;
  descriptionId: string;
  icon: typeof Cloud;
  context: CloudRouteContext;
  showInSidebar: boolean;
  requiredCapability?: string;
  webPath: (projectId?: string) => string;
};

export const CLOUD_ROUTES = [
  {
    id: "overview",
    labelId: "cloud.route.overview.label",
    titleId: "cloud.route.overview.title",
    descriptionId: "cloud.route.overview.description",
    icon: Cloud,
    context: "projects",
    showInSidebar: true,
    webPath: (projectId?: string) => (projectId ? `/projects/${projectId}/access` : "/projects"),
  },
  {
    id: "templates",
    labelId: "cloud.route.templates.label",
    titleId: "cloud.route.templates.title",
    descriptionId: "cloud.route.templates.description",
    icon: LayoutTemplate,
    context: "projects",
    showInSidebar: true,
    webPath: () => "/templates",
  },
  {
    id: "cloud-team",
    labelId: "cloud.route.cloud-team.label",
    titleId: "cloud.route.cloud-team.title",
    descriptionId: "cloud.route.cloud-team.description",
    icon: Users,
    context: "account",
    showInSidebar: true,
    webPath: () => "/team",
  },
  {
    id: "cloud-billing",
    labelId: "cloud.route.cloud-billing.label",
    titleId: "cloud.route.cloud-billing.title",
    descriptionId: "cloud.route.cloud-billing.description",
    icon: CreditCard,
    context: "account",
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
    showInSidebar: true,
    webPath: (projectId?: string) => `/projects/${requireProjectId(projectId)}/data`,
  },
  {
    id: "history",
    labelId: "cloud.route.history.label",
    titleId: "cloud.route.history.title",
    descriptionId: "cloud.route.history.description",
    icon: Clock3,
    context: "project",
    showInSidebar: true,
    webPath: (projectId?: string) => `/projects/${requireProjectId(projectId)}/changes`,
  },
  {
    id: "claude",
    labelId: "cloud.route.claude.label",
    titleId: "cloud.route.claude.title",
    descriptionId: "cloud.route.claude.description",
    icon: Bot,
    context: "project",
    showInSidebar: true,
    requiredCapability: "agent.read",
    webPath: (projectId?: string) => `/projects/${requireProjectId(projectId)}/agent`,
  },
  {
    id: "branches",
    labelId: "cloud.route.branches.label",
    titleId: "cloud.route.branches.title",
    descriptionId: "cloud.route.branches.description",
    icon: GitBranch,
    context: "project",
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
    showInSidebar: true,
    webPath: (projectId?: string) => `/projects/${requireProjectId(projectId)}/access`,
  },
  {
    id: "mcp-cli",
    labelId: "cloud.route.mcp-cli.label",
    titleId: "cloud.route.mcp-cli.title",
    descriptionId: "cloud.route.mcp-cli.description",
    icon: SquareTerminal,
    context: "project",
    showInSidebar: false,
    webPath: (projectId?: string) => `/projects/${requireProjectId(projectId)}/access`,
  },
  {
    id: "git-sync",
    labelId: "cloud.route.git-sync.label",
    titleId: "cloud.route.git-sync.title",
    descriptionId: "cloud.route.git-sync.description",
    icon: GitBranch,
    context: "project",
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
    showInSidebar: true,
    requiredCapability: "project.settings.manage",
    webPath: (projectId?: string) => `/projects/${requireProjectId(projectId)}/settings`,
  },
] as const satisfies readonly CloudRouteDescriptor[];

export const CLOUD_ROUTE_BY_ID = Object.fromEntries(
  CLOUD_ROUTES.map((route) => [route.id, route]),
) as Record<CloudWorkspaceSection, CloudRouteDescriptor>;

export const CLOUD_ACCOUNT_ROUTES = CLOUD_ROUTES.filter((route) => route.context === "account" && route.showInSidebar);
export const CLOUD_PROJECT_ROUTES = CLOUD_ROUTES.filter((route) => route.context === "project");
export const CLOUD_PROJECT_SIDEBAR_ROUTES = CLOUD_PROJECT_ROUTES.filter((route) => route.showInSidebar);
/** Repository-context Project hub: Project sections + account Team/Billing as a second group. */
export const CLOUD_BOUND_PROJECT_SIDEBAR_ROUTES = [
  ...CLOUD_PROJECT_SIDEBAR_ROUTES,
  ...CLOUD_ACCOUNT_ROUTES,
];
export const CLOUD_PROJECTS_SIDEBAR_ROUTES = CLOUD_ROUTES.filter((route) => route.context === "projects" && route.showInSidebar);
export const CLOUD_GLOBAL_SIDEBAR_ROUTES = [
  ...CLOUD_PROJECTS_SIDEBAR_ROUTES,
  ...CLOUD_ACCOUNT_ROUTES,
];

export function normalizeCloudSection(
  section: CloudWorkspaceSection | "cloud-settings" | "integrations",
): CloudWorkspaceSection {
  if (section === "cloud-settings") return "overview";
  if (section === "integrations") return "automation";
  if (section === "mcp-cli" || section === "git-sync") return "access";
  return section;
}

export function getCloudRoute(section: CloudWorkspaceSection): CloudRouteDescriptor {
  return CLOUD_ROUTE_BY_ID[section] ?? CLOUD_ROUTE_BY_ID.overview;
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

export function isCloudAccountSection(section: CloudWorkspaceSection): boolean {
  return getCloudRoute(section).context === "account";
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
