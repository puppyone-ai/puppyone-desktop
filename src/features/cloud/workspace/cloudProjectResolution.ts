import type { Workspace } from "@puppyone/shared-ui";
import type {
  DesktopCloudProject,
  DesktopCloudSession,
} from "../../../lib/cloudApi";
import type { GitStatusSnapshot } from "../../../types/electron";
import { getPuppyoneRemote } from "../../source-control/remotes";
import {
  extractRemoteProjectCandidateId,
  isProjectAccessible,
  resolveMappedCloudProjectId,
} from "./resolveMappedCloudProjectId";
import type { RecentWorkspaceHomeItem } from "../../../components/MinimalOnboarding";

export type RecentWorkspaceCloudBinding = {
  projectId: string | null;
  cloudLinked: boolean;
  error: string | null;
  /** Optional machine-readable reason for UI routing. */
  reason?: "not-authorized" | "unresolvable" | "network" | null;
};

export const CLOUD_PROJECT_NOT_AUTHORIZED_MESSAGE =
  "You don’t have access to the Cloud project linked to this folder.";

export const CLOUD_PROJECT_UNRESOLVABLE_MESSAGE =
  "We found a PuppyOne Cloud remote, but couldn’t identify its project.";

/** @deprecated Prefer CLOUD_PROJECT_UNRESOLVABLE_MESSAGE — kept for older call sites. */
export const CLOUD_PROJECT_MAPPING_ERROR = CLOUD_PROJECT_UNRESOLVABLE_MESSAGE;

export type WorkspaceCloudProjectResolution =
  | { status: "mapped"; projectId: string }
  | { status: "not-authorized"; candidateProjectId: string | null; message: string }
  | { status: "unresolvable"; message: string }
  | { status: "unmapped" };

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

/**
 * Single workspace → Cloud project binding resolver for Local repos.
 * Accessible-project membership is mandatory before any id is returned as mapped.
 */
export async function resolveWorkspaceCloudProjectBinding({
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
}): Promise<WorkspaceCloudProjectResolution> {
  const cloudRemote = getPuppyoneRemote(activeGitStatus);
  if (!cloudRemote) {
    const configured = configuredProjectId?.trim() || null;
    if (configured && isProjectAccessible(projects, configured)) {
      return { status: "mapped", projectId: configured };
    }
    return { status: "unmapped" };
  }

  const remoteCandidateId = extractRemoteProjectCandidateId(cloudRemote);
  const configuredAccessible = isProjectAccessible(projects, configuredProjectId)
    ? configuredProjectId!.trim()
    : null;

  // Prefer configured id when still accessible for this account/host.
  if (configuredAccessible) {
    return { status: "mapped", projectId: configuredAccessible };
  }

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
    maxProjectScan: preferredProjects.length,
  });

  if (!projectId && candidateProjects.length > 0) {
    projectId = await resolveMappedCloudProjectId({
      session,
      projects,
      cloudRemote,
      configuredProjectId,
      onSessionChange,
      cloudApiBaseUrl: apiBaseUrl,
      maxProjectScan: projects.length,
    });
  }

  if (projectId) {
    return { status: "mapped", projectId };
  }

  if (remoteCandidateId && !isProjectAccessible(projects, remoteCandidateId)) {
    return {
      status: "not-authorized",
      candidateProjectId: remoteCandidateId,
      message: CLOUD_PROJECT_NOT_AUTHORIZED_MESSAGE,
    };
  }

  if (configuredProjectId?.trim() && !isProjectAccessible(projects, configuredProjectId)) {
    return {
      status: "not-authorized",
      candidateProjectId: configuredProjectId.trim(),
      message: CLOUD_PROJECT_NOT_AUTHORIZED_MESSAGE,
    };
  }

  return {
    status: "unresolvable",
    message: CLOUD_PROJECT_UNRESOLVABLE_MESSAGE,
  };
}

/** @deprecated Use resolveWorkspaceCloudProjectBinding and read `.projectId` when mapped. */
export async function resolveWorkspaceCloudProjectId(
  args: Parameters<typeof resolveWorkspaceCloudProjectBinding>[0],
): Promise<string | null> {
  const resolution = await resolveWorkspaceCloudProjectBinding(args);
  return resolution.status === "mapped" ? resolution.projectId : null;
}

export async function resolveRecentWorkspaceCloudBinding({
  item,
  projects,
  session,
}: {
  item: RecentWorkspaceHomeItem;
  projects: DesktopCloudProject[];
  session: DesktopCloudSession | null;
}): Promise<[string, RecentWorkspaceCloudBinding]> {
  const configuredProjectId = item.workspace.cloudProjectId?.trim() || null;
  const configError = item.workspace.configError ?? null;

  if (!configuredProjectId) {
    return [item.workspace.id, {
      projectId: null,
      cloudLinked: false,
      error: configError,
      reason: null,
    }];
  }

  // This value is a main-owned cache hint from the recent-workspace registry.
  // Inactive folders never receive renderer filesystem authority, so the home
  // surface must not probe their config or Git remotes through workspace IPC.
  if (!session || isProjectAccessible(projects, configuredProjectId)) {
    return [item.workspace.id, {
      projectId: configuredProjectId,
      cloudLinked: true,
      error: configError,
      reason: null,
    }];
  }

  return [item.workspace.id, {
    projectId: null,
    cloudLinked: true,
    error: CLOUD_PROJECT_NOT_AUTHORIZED_MESSAGE,
    reason: "not-authorized",
  }];
}

export function getPuppyoneRemoteProjectId(status: GitStatusSnapshot | null): string | null {
  const cloudRemote = getPuppyoneRemote(status);
  return extractRemoteProjectCandidateId(cloudRemote);
}
