import {
  getCloudAccessPointSemantics,
  getCloudRepoIdentity,
  listCloudScopes,
  type DesktopCloudProject,
  type DesktopCloudSession,
} from "../../../lib/cloudApi";
import {
  getPuppyoneRemote,
  normalizeRemoteUrlForCompare,
  parsePuppyoneRemote,
} from "../../source-control/remotes";

function projectExists(projects: DesktopCloudProject[], projectId: string | null | undefined): projectId is string {
  const normalized = projectId?.trim() || "";
  if (!normalized) return false;
  return projects.some((project) => project.id === normalized);
}

function pickAccessibleProjectId(
  projects: DesktopCloudProject[],
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const candidate of candidates) {
    const normalized = candidate?.trim() || "";
    if (projectExists(projects, normalized)) return normalized;
  }
  return null;
}

async function resolveProjectIdByScopes({
  accessKey,
  cloudApiBaseUrl,
  maxProjectScan,
  onSessionChange,
  projects,
  session,
}: {
  accessKey: string;
  cloudApiBaseUrl: string | null;
  maxProjectScan: number;
  onSessionChange: (session: DesktopCloudSession | null) => void;
  projects: DesktopCloudProject[];
  session: DesktopCloudSession;
}) {
  const candidates = projects.slice(0, Math.max(0, maxProjectScan));
  const matches = await Promise.all(candidates.map(async (project) => {
    try {
      const scopes = await listCloudScopes(session, project.id, onSessionChange, cloudApiBaseUrl);
      // Any matching scope is enough to identify the owning project — root scope is not required.
      return scopes.some((scope) => scope.access_key === accessKey) ? project.id : null;
    } catch {
      return null;
    }
  }));
  return matches.find((projectId): projectId is string => Boolean(projectId)) ?? null;
}

/**
 * Resolve a PuppyOne Cloud Git remote to an accessible Cloud project id.
 *
 * Rules:
 * - Never match by hostname alone.
 * - Non-root Access Point scopes still identify their owning project.
 * - Candidate ids must exist in the current session's accessible project list.
 */
export async function resolveMappedCloudProjectId({
  session,
  projects,
  cloudRemote,
  configuredProjectId,
  onSessionChange,
  cloudApiBaseUrl,
  maxProjectScan = 50,
}: {
  session: DesktopCloudSession;
  projects: DesktopCloudProject[];
  cloudRemote: ReturnType<typeof getPuppyoneRemote>;
  configuredProjectId: string | null;
  onSessionChange: (session: DesktopCloudSession | null) => void;
  cloudApiBaseUrl: string | null;
  /** @deprecated Ignored — project identity no longer requires a root scope. */
  requireRootScope?: boolean;
  maxProjectScan?: number;
}): Promise<string | null> {
  if (!cloudRemote) {
    return pickAccessibleProjectId(projects, configuredProjectId);
  }

  if (cloudRemote.info.kind === "project") {
    return pickAccessibleProjectId(projects, cloudRemote.info.projectId, configuredProjectId);
  }

  if (cloudRemote.info.kind !== "access-point" || !cloudRemote.info.accessKey) {
    return pickAccessibleProjectId(projects, configuredProjectId);
  }

  const accessKey = cloudRemote.info.accessKey;
  try {
    const semantics = await getCloudAccessPointSemantics(
      accessKey,
      session.user_email,
      cloudRemote.rawUrl,
      cloudApiBaseUrl,
    );
    const semanticProjectId = pickAccessibleProjectId(
      projects,
      semantics.project_id,
      semantics.scope?.project_id,
      semantics.scope?.repo_id,
    );
    if (semanticProjectId) return semanticProjectId;
  } catch {
    // Older backends may not expose AP-FS semantics; fall back below.
  }

  const configuredAccessible = pickAccessibleProjectId(projects, configuredProjectId);
  if (configuredAccessible) return configuredAccessible;

  const remoteUrl = normalizeRemoteUrlForCompare(cloudRemote.rawUrl);
  const scopedProjectId = await resolveProjectIdByScopes({
    accessKey,
    cloudApiBaseUrl,
    maxProjectScan,
    onSessionChange,
    projects,
    session,
  });
  if (scopedProjectId) return scopedProjectId;

  for (const project of projects.slice(0, Math.max(0, maxProjectScan))) {
    try {
      const identity = await getCloudRepoIdentity(session, project.id, onSessionChange, cloudApiBaseUrl);
      const identityRemote = parsePuppyoneRemote(identity.url);
      if (identityRemote?.kind === "access-point" && identityRemote.accessKey === accessKey) {
        return project.id;
      }
      if (normalizeRemoteUrlForCompare(identity.url) === remoteUrl) return project.id;
      if (identity.scopes.some((scope) => scope.access_key === accessKey)) {
        return project.id;
      }
    } catch {
      // Identity may be unavailable for a project; continue scanning.
    }
  }
  return null;
}

export function extractRemoteProjectCandidateId(
  cloudRemote: ReturnType<typeof getPuppyoneRemote>,
): string | null {
  if (!cloudRemote) return null;
  if (cloudRemote.info.kind === "project") {
    return cloudRemote.info.projectId?.trim() || null;
  }
  return null;
}

export function isProjectAccessible(
  projects: DesktopCloudProject[],
  projectId: string | null | undefined,
): boolean {
  return projectExists(projects, projectId);
}
