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
import type { GitStatusSnapshot } from "../../../types/electron";

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
  requireWrite = false,
  onSessionChange,
}: {
  session: DesktopCloudSession;
  apiBaseUrl: string | null;
  project?: DesktopCloudProject | null;
  projectId: string;
  target?: RepositoryTarget;
  requireWrite?: boolean;
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
  if (requireWrite && !projectAllows(resolvedProject, "content.write")) {
    throw new Error("Write access to the Cloud Project is required to initialize its Git repository.");
  }
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
    || (requireWrite && issued.mode !== "rw")
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

/**
 * Initialization is allowed to create the canonical remote, never to repoint an
 * existing one. Callers must use a freshly-read snapshot for this preflight.
 */
export function assertCloudRemoteNameAvailable(
  status: GitStatusSnapshot,
  remoteName = "puppyone",
): void {
  const normalizedRemoteName = remoteName.toLowerCase();
  if (status.remotes.some((remote) => remote.name.toLowerCase() === normalizedRemoteName)) {
    throw new Error(
      `A Git remote named "${remoteName}" already exists. Remove or rename it before initializing this project on PuppyOne Cloud.`,
    );
  }
}

/**
 * Protect the asynchronous Initialize flow from publishing a different local
 * history than the one the user reviewed when the operation started.
 */
export function assertExpectedGitRepositoryState(
  status: GitStatusSnapshot,
  expected: {
    headCommitId?: string;
    branch?: string;
  },
): void {
  const actualBranch = status.branch;
  const normalizedBranch = actualBranch?.toLowerCase();
  if (
    !status.isRepo
    || !status.headCommitId
    || !actualBranch
    || normalizedBranch === "head"
    || normalizedBranch === "detached"
    || (expected.headCommitId !== undefined && status.headCommitId !== expected.headCommitId)
    || (expected.branch !== undefined && actualBranch !== expected.branch)
  ) {
    throw new Error(
      "The local Git branch or HEAD changed while PuppyOne Cloud initialization was starting. Review the current branch and try again.",
    );
  }
}
