import type { Workspace } from "@puppyone/shared-ui";
import {
  getWorkspaceGitStatus,
  readPuppyoneWorkspaceConfig,
} from "../../../lib/localFiles";
import type {
  DesktopCloudProject,
  DesktopCloudSession,
} from "../../../lib/cloudApi";
import type { GitStatusSnapshot } from "../../../types/electron";
import { getPuppyoneRemote } from "../../source-control/remotes";
import { resolveMappedCloudProjectId } from "./resolveMappedCloudProjectId";
import type { RecentWorkspaceHomeItem } from "../../../components/MinimalOnboarding";

export type RecentWorkspaceCloudBinding = {
  projectId: string | null;
  cloudLinked: boolean;
  error: string | null;
};

export const CLOUD_PROJECT_MAPPING_ERROR = "This workspace has a Puppyone Cloud Git remote, but Desktop could not match it to a Cloud project root scope.";

function normalizeCloudProjectCandidate(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .replace(/\.git$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function basenameFromPath(path: string | null | undefined) {
  const normalized = (path ?? "").trim().replace(/[\\/]+$/g, "");
  if (!normalized) return "";
  return normalized.split(/[\\/]/).pop() ?? "";
}

function repoNameFromRemoteUrl(rawUrl: string | null | undefined) {
  const remote = (rawUrl ?? "").trim();
  if (!remote) return "";
  try {
    const url = new URL(remote);
    return basenameFromPath(url.pathname);
  } catch {
    const match = remote.match(/[:/]([^/:]+?)(?:\.git)?$/);
    return match?.[1] ?? "";
  }
}

function getCloudProjectCandidateNames(workspace: Workspace | null, status: GitStatusSnapshot | null) {
  const candidates = new Set<string>();
  const add = (value: string | null | undefined) => {
    const normalized = normalizeCloudProjectCandidate(value);
    if (normalized) candidates.add(normalized);
  };

  add(workspace?.name);
  add(basenameFromPath(workspace?.path));
  for (const remote of status?.remotes ?? []) {
    const fetchRepo = repoNameFromRemoteUrl(remote.fetchUrl);
    const pushRepo = repoNameFromRemoteUrl(remote.pushUrl);
    if (!fetchRepo.startsWith("cli_")) add(fetchRepo);
    if (!pushRepo.startsWith("cli_")) add(pushRepo);
  }
  return candidates;
}

function filterCandidateCloudProjects({
  projects,
  status,
  workspace,
}: {
  projects: DesktopCloudProject[];
  status: GitStatusSnapshot | null;
  workspace: Workspace | null;
}) {
  const candidateNames = getCloudProjectCandidateNames(workspace, status);
  if (candidateNames.size === 0) return [];
  return projects.filter((project) => (
    candidateNames.has(normalizeCloudProjectCandidate(project.name))
  ));
}

export async function resolveWorkspaceCloudProjectId({
  activeGitStatus,
  apiBaseUrl,
  configuredProjectId,
  onSessionChange,
  projects,
  session,
  workspace,
}: {
  activeGitStatus: GitStatusSnapshot | null;
  apiBaseUrl: string | null;
  configuredProjectId: string | null;
  onSessionChange: (session: DesktopCloudSession | null) => void;
  projects: DesktopCloudProject[];
  session: DesktopCloudSession;
  workspace: Workspace | null;
}) {
  const cloudRemote = getPuppyoneRemote(activeGitStatus);
  if (!cloudRemote) return configuredProjectId;

  const candidateProjects = filterCandidateCloudProjects({
    projects,
    status: activeGitStatus,
    workspace,
  });
  const preferredProjects = candidateProjects.length > 0 ? candidateProjects : projects;
  let projectId = await resolveMappedCloudProjectId({
    session,
    projects: preferredProjects,
    cloudRemote,
    configuredProjectId,
    onSessionChange,
    cloudApiBaseUrl: apiBaseUrl,
    requireRootScope: true,
    maxProjectScan: preferredProjects.length,
  });
  if (projectId || candidateProjects.length === 0) return projectId;

  projectId = await resolveMappedCloudProjectId({
    session,
    projects,
    cloudRemote,
    configuredProjectId,
    onSessionChange,
    cloudApiBaseUrl: apiBaseUrl,
    requireRootScope: true,
    maxProjectScan: projects.length,
  });
  return projectId;
}

export async function resolveRecentWorkspaceCloudBinding({
  apiBaseUrl,
  item,
  onSessionChange,
  projects,
  session,
}: {
  apiBaseUrl: string | null;
  item: RecentWorkspaceHomeItem;
  onSessionChange: (session: DesktopCloudSession | null) => void;
  projects: DesktopCloudProject[];
  session: DesktopCloudSession | null;
}): Promise<[string, RecentWorkspaceCloudBinding]> {
  const rootPath = item.workspace.path;
  let configuredProjectId: string | null = null;
  let configError: string | null = null;
  try {
    const config = await readPuppyoneWorkspaceConfig(rootPath);
    configuredProjectId = config.cloud.projectId?.trim() || null;
  } catch (error) {
    configError = error instanceof Error ? error.message : String(error);
  }

  if (configuredProjectId) {
    return [item.workspace.id, {
      projectId: configuredProjectId,
      cloudLinked: true,
      error: configError,
    }];
  }

  const gitStatusResult = await getWorkspaceGitStatus(rootPath).catch(() => null);
  const cloudRemote = gitStatusResult ? getPuppyoneRemote(gitStatusResult) : null;

  if (!cloudRemote) {
    return [item.workspace.id, {
      projectId: null,
      cloudLinked: false,
      error: configError,
    }];
  }

  if (session) {
    try {
      const projectId = await resolveWorkspaceCloudProjectId({
        activeGitStatus: gitStatusResult,
        apiBaseUrl,
        configuredProjectId,
        onSessionChange,
        projects,
        session,
        workspace: item.workspace,
      });
      return [item.workspace.id, {
        projectId,
        cloudLinked: Boolean(projectId),
        error: null,
      }];
    } catch (error) {
      return [item.workspace.id, {
        projectId: configuredProjectId,
        cloudLinked: Boolean(configuredProjectId),
        error: error instanceof Error ? error.message : String(error),
      }];
    }
  }

  const remoteProjectId = cloudRemote.info.kind === "project"
    ? cloudRemote.info.projectId?.trim() || null
    : null;
  return [item.workspace.id, {
    projectId: remoteProjectId ?? configuredProjectId,
    cloudLinked: Boolean(remoteProjectId ?? configuredProjectId),
    error: null,
  }];
}

export function getPuppyoneRemoteProjectId(status: GitStatusSnapshot | null): string | null {
  const cloudRemote = getPuppyoneRemote(status);
  if (cloudRemote?.info.kind !== "project") return null;
  return cloudRemote.info.projectId?.trim() || null;
}
