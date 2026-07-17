import type { Workspace } from "@puppyone/shared-ui";
import type {
  ProjectHomeItem,
  RecentWorkspaceHomeItem,
} from "../../components/MinimalOnboarding";
import type { DesktopCloudProject } from "../../lib/cloudApi";
import {
  createCloudWorkspace,
  isCloudWorkspace,
} from "../../lib/cloudDataPort";
import type { DesktopWorkspaceSwitcherItem } from "./DesktopWorkspaceSwitcher";
import type { RecentWorkspaceCloudContext } from "../cloud/workspace/cloudProjectResolution";
import type { getRecentWorkspaces } from "../../lib/localFiles";

export function mergeWorkspaceLists(current: Workspace[], incoming: Workspace[]) {
  const byLocation = new Map<string, Workspace>();
  for (const workspace of [...current, ...incoming]) {
    byLocation.set(workspace.path, workspace);
  }
  return Array.from(byLocation.values());
}

export function getRecentWorkspaceItems(result: Awaited<ReturnType<typeof getRecentWorkspaces>>): RecentWorkspaceHomeItem[] {
  if (result.items) return result.items;
  return result.workspaces.map((workspace) => ({
    workspace,
    lastOpenedAt: null,
  }));
}

export function getWorkspaceSwitcherItems({
  cloudProjects,
  includeCloud,
  workspaces,
}: {
  cloudProjects: DesktopCloudProject[];
  includeCloud: boolean;
  workspaces: Workspace[];
}): DesktopWorkspaceSwitcherItem[] {
  const cloudWorkspaces = includeCloud
    ? mergeWorkspaceLists(cloudProjects.map(createCloudWorkspace), workspaces.filter(isCloudWorkspace))
    : [];
  const localWorkspaces = workspaces.filter((item) => !isCloudWorkspace(item));

  return [
    ...cloudWorkspaces.map((workspace) => createWorkspaceSwitcherItem(workspace, "cloud")),
    ...localWorkspaces.map((workspace) => createWorkspaceSwitcherItem(workspace, "local")),
  ];
}

export function getHomeProjectItems({
  contexts,
  cloudProjects,
  includeUnboundCloudProjects = true,
  recentWorkspaceItems,
}: {
  contexts: Record<string, RecentWorkspaceCloudContext>;
  cloudProjects: DesktopCloudProject[];
  includeUnboundCloudProjects?: boolean;
  recentWorkspaceItems: RecentWorkspaceHomeItem[];
}): ProjectHomeItem[] {
  const cloudProjectById = new Map(cloudProjects.map((project) => [project.id, project]));
  const consumedCloudProjectIds = new Set<string>();
  const items: ProjectHomeItem[] = [];

  for (const item of recentWorkspaceItems.slice(0, 20)) {
    const context = contexts[item.workspace.id];
    const project = context?.projectId ? cloudProjectById.get(context.projectId) ?? null : null;
    if (project) consumedCloudProjectIds.add(project.id);

    const hasCloudRemote = context?.hasCloudRemote === true;
    items.push({
      id: project ? `cloud-local:${project.id}:${item.workspace.id}` : `local:${item.workspace.id}`,
      kind: project ? "cloud-local" : hasCloudRemote ? "cloud-linked" : "local",
      label: item.workspace.path,
      detail: project?.name ?? null,
      localPath: item.workspace.path,
      cloudProjectId: context?.projectId ?? project?.id ?? null,
      description: project?.description ?? null,
      lastOpenedAt: item.lastOpenedAt ?? null,
      updatedAt: project?.updated_at ?? null,
    });
  }

  if (includeUnboundCloudProjects) {
    for (const project of cloudProjects.slice(0, 40)) {
      if (consumedCloudProjectIds.has(project.id)) continue;
      items.push({
        id: `cloud:${project.id}`,
        kind: "cloud",
        label: project.name || "",
        cloudProjectId: project.id,
        description: project.description ?? null,
        updatedAt: project.updated_at ?? null,
      });
    }
  }

  return items;
}

export function findRecentLocalWorkspaceForCloudProject({
  contexts,
  projectId,
  recentWorkspaceItems,
}: {
  contexts: Record<string, RecentWorkspaceCloudContext>;
  projectId: string | null;
  recentWorkspaceItems: RecentWorkspaceHomeItem[];
}): RecentWorkspaceHomeItem | null {
  if (!projectId) return null;
  return recentWorkspaceItems.find((item) => (
    contexts[item.workspace.id]?.projectId === projectId
  )) ?? null;
}

function createWorkspaceSwitcherItem(
  workspace: Workspace,
  kind: DesktopWorkspaceSwitcherItem["kind"],
): DesktopWorkspaceSwitcherItem {
  const detail = kind === "cloud" ? "PuppyOne Cloud" : workspace.path;
  return {
    id: workspace.id,
    kind,
    label: workspace.name,
    detail,
    title: `${workspace.name} - ${detail}`,
    workspace,
  };
}
