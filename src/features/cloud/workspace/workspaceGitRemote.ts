import {
  getCloudProject,
  issueCloudGitCredential,
  projectAllows,
  type DesktopCloudProject,
  type DesktopCloudSession,
} from "../../../lib/cloudApi";
import {
  projectRootTarget,
  sameRepositoryTarget,
  type RepositoryTarget,
} from "../repositoryTarget";

type MutableSessionHandler = (session: DesktopCloudSession | null) => void | Promise<void>;

export function cloudOriginFromApiBase(apiBaseUrl: string): string {
  const parsed = new URL(apiBaseUrl);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Cloud API must use HTTP(S).");
  }
  return parsed.origin.toLowerCase();
}

export function sameCloudOrigin(
  left: string | null | undefined,
  rightApiBase: string | null | undefined,
): boolean {
  if (!left || !rightApiBase) return false;
  try {
    return cloudOriginFromApiBase(left) === cloudOriginFromApiBase(rightApiBase);
  } catch {
    return false;
  }
}

export function isTrustedCloudGitOrigin(
  remoteOrOrigin: string | null | undefined,
  apiBaseUrl: string | null | undefined,
): boolean {
  if (sameCloudOrigin(remoteOrOrigin, apiBaseUrl)) return true;
  if (!remoteOrOrigin || !isLoopbackOrigin(apiBaseUrl)) return false;
  const configuredGitOrigin = (
    import.meta as ImportMeta & { env?: Record<string, string | undefined> }
  ).env?.VITE_DESKTOP_CLOUD_GIT_ORIGIN?.trim();
  return Boolean(configuredGitOrigin && sameCloudOrigin(remoteOrOrigin, configuredGitOrigin));
}

function isLoopbackOrigin(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    return ["localhost", "127.0.0.1", "::1"].includes(new URL(value).hostname);
  } catch {
    return false;
  }
}

/**
 * Mint one user-owned Git credential for one exact repository target.
 * No local path, workspace id, device id, or checkout identity crosses this
 * boundary.
 */
export async function issueWorkspaceGitRemote({
  session,
  apiBaseUrl,
  project,
  projectId,
  target,
  onSessionChange,
}: {
  session: DesktopCloudSession;
  apiBaseUrl: string | null;
  project?: DesktopCloudProject | null;
  projectId: string;
  target?: RepositoryTarget;
  onSessionChange: MutableSessionHandler;
}): Promise<{
  credentialId: string;
  remoteUrl: string;
  credential: string;
  username: string;
  target: RepositoryTarget;
  project: DesktopCloudProject;
}> {
  const resolvedTarget = target ?? projectRootTarget(projectId);
  if (resolvedTarget.project_id !== projectId) {
    throw new Error("The repository target does not belong to the selected Cloud Project.");
  }
  const resolvedProject = project?.id === projectId
    ? project
    : await getCloudProject(session, projectId, onSessionChange, apiBaseUrl);
  const mode = projectAllows(resolvedProject, "content.write") ? "rw" : "r";
  const issued = await issueCloudGitCredential(
    session,
    projectId,
    { target: resolvedTarget, mode },
    onSessionChange,
    apiBaseUrl,
  );
  const remoteUrl = issued.remote?.url?.trim();
  if (
    !issued.id?.trim()
    || !issued.credential?.trim()
    || !remoteUrl
    || !sameRepositoryTarget(issued.remote.target, resolvedTarget)
    || !isTrustedCloudGitOrigin(remoteUrl, apiBaseUrl ?? session.api_base_url)
  ) {
    throw new Error("Cloud returned an invalid Git credential response.");
  }
  return {
    credentialId: issued.id,
    remoteUrl,
    credential: issued.credential,
    username: issued.remote.username || "x-puppyone-token",
    target: resolvedTarget,
    project: resolvedProject,
  };
}
