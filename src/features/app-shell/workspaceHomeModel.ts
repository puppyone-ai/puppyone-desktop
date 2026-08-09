import type { Workspace } from "@puppyone/shared-ui";
import type { RecentWorkspaceHomeItem } from "../../components/MinimalOnboarding";
import type { DesktopWorkspaceSwitcherItem } from "./DesktopWorkspaceSwitcher";
import type { getRecentWorkspaces } from "../../lib/localFiles";

export function mergeWorkspaceLists(current: Workspace[], incoming: Workspace[]) {
  const byLocation = new Map<string, Workspace>();
  for (const workspace of [...current, ...incoming]) {
    byLocation.set(workspace.path, workspace);
  }
  return Array.from(byLocation.values());
}

export function getRecentWorkspaceItems(
  result: Awaited<ReturnType<typeof getRecentWorkspaces>>,
): RecentWorkspaceHomeItem[] {
  if (result.items) return result.items;
  return result.workspaces.map((workspace) => ({
    workspace,
    lastOpenedAt: null,
  }));
}

/** The switcher is a local-workspace registry, never a Cloud Project catalog. */
export function getWorkspaceSwitcherItems({
  workspaces,
}: {
  workspaces: Workspace[];
}): DesktopWorkspaceSwitcherItem[] {
  return workspaces.map((workspace) => ({
    id: workspace.id,
    label: workspace.name,
    detail: getWorkspaceParentPathForDisplay(workspace.path),
    title: `${workspace.name} - ${workspace.path}`,
    workspace,
  }));
}

export function getWorkspaceParentPathForDisplay(workspacePath: string): string {
  const trimmedPath = workspacePath.trim();
  if (!trimmedPath) return "";

  const normalizedPath = trimmedPath.length > 1
    ? trimmedPath.replace(/\/+$/, "")
    : trimmedPath;
  const separatorIndex = normalizedPath.lastIndexOf("/");
  if (separatorIndex < 0) return "";

  const parentPath = separatorIndex === 0
    ? "/"
    : normalizedPath.slice(0, separatorIndex);
  if (/^\/Users\/[^/]+$/.test(parentPath)) return "~";
  return parentPath.replace(/^\/Users\/[^/]+(?=\/)/, "~");
}
