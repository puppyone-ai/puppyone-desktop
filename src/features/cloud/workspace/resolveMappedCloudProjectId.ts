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

function isRootScope(scope: { path?: string | null; is_root?: boolean | null } | null | undefined) {
  if (!scope) return false;
  if (scope.is_root === true) return true;
  return (scope.path ?? "").trim().replace(/^\/+|\/+$/g, "") === "";
}

async function resolveProjectIdByScopes({
  accessKey,
  cloudApiBaseUrl,
  maxProjectScan,
  onSessionChange,
  projects,
  requireRootScope,
  session,
}: {
  accessKey: string;
  cloudApiBaseUrl: string | null;
  maxProjectScan: number;
  onSessionChange: (session: DesktopCloudSession | null) => void;
  projects: DesktopCloudProject[];
  requireRootScope: boolean;
  session: DesktopCloudSession;
}) {
  const candidates = projects.slice(0, Math.max(0, maxProjectScan));
  const matches = await Promise.all(candidates.map(async (project) => {
    try {
      const scopes = await listCloudScopes(session, project.id, onSessionChange, cloudApiBaseUrl);
      return scopes.some((scope) => scope.access_key === accessKey && (!requireRootScope || isRootScope(scope)))
        ? project.id
        : null;
    } catch {
      return null;
    }
  }));
  return matches.find((projectId): projectId is string => Boolean(projectId)) ?? null;
}

export async function resolveMappedCloudProjectId({
  session,
  projects,
  cloudRemote,
  configuredProjectId,
  onSessionChange,
  cloudApiBaseUrl,
  requireRootScope = false,
  maxProjectScan = 50,
}: {
  session: DesktopCloudSession;
  projects: DesktopCloudProject[];
  cloudRemote: ReturnType<typeof getPuppyoneRemote>;
  configuredProjectId: string | null;
  onSessionChange: (session: DesktopCloudSession | null) => void;
  cloudApiBaseUrl: string | null;
  requireRootScope?: boolean;
  maxProjectScan?: number;
}): Promise<string | null> {
  if (!cloudRemote) return configuredProjectId;
  if (cloudRemote.info.kind === "project" && cloudRemote.info.projectId) {
    return cloudRemote.info.projectId;
  }
  if (cloudRemote.info.kind !== "access-point" || !cloudRemote.info.accessKey) {
    return configuredProjectId;
  }

  const accessKey = cloudRemote.info.accessKey;
  try {
    const semantics = await getCloudAccessPointSemantics(
      accessKey,
      session.user_email,
      cloudRemote.rawUrl,
      cloudApiBaseUrl,
    );
    const semanticProjectId = (
      semantics.project_id
      || semantics.scope?.project_id
      || ""
    ).trim();
    if (semanticProjectId && (!requireRootScope || isRootScope(semantics.scope))) {
      return semanticProjectId;
    }

    const repoId = (semantics.scope?.repo_id || "").trim();
    if (repoId && (!requireRootScope || isRootScope(semantics.scope)) && projects.some((project) => project.id === repoId)) {
      return repoId;
    }
  } catch {
    // Older backends may not expose AP-FS semantics; fall back to authenticated project metadata below.
  }

  if (configuredProjectId && !requireRootScope) return configuredProjectId;

  const remoteUrl = normalizeRemoteUrlForCompare(cloudRemote.rawUrl);
  const scopedProjectId = await resolveProjectIdByScopes({
    accessKey,
    cloudApiBaseUrl,
    maxProjectScan,
    onSessionChange,
    projects,
    requireRootScope,
    session,
  });
  if (scopedProjectId) return scopedProjectId;
  if (requireRootScope) return null;

  for (const project of projects.slice(0, Math.max(0, maxProjectScan))) {
    try {
      const identity = await getCloudRepoIdentity(session, project.id, onSessionChange, cloudApiBaseUrl);
      const identityRemote = parsePuppyoneRemote(identity.url);
      if (!requireRootScope && identityRemote?.kind === "access-point" && identityRemote.accessKey === accessKey) {
        return project.id;
      }
      if (!requireRootScope && normalizeRemoteUrlForCompare(identity.url) === remoteUrl) return project.id;
      if (identity.scopes.some((scope) => scope.access_key === accessKey && (!requireRootScope || isRootScope(scope)))) {
        return project.id;
      }
    } catch {
      // Identity may be unavailable for a project; continue scanning.
    }
  }
  return null;
}
