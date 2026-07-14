import type { Workspace } from "@puppyone/shared-ui";
import {
  createCloudWorkspaceBinding,
  getCloudProject,
  projectAllows,
  revokeCloudWorkspaceBinding,
  revokeCloudWorkspaceBindingCredential,
  rotateCloudWorkspaceBindingCredential,
  type DesktopCloudProject,
  type DesktopCloudSession,
  type DesktopCloudWorkspaceBinding,
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
    throw new Error("Cloud API must use HTTP(S). ");
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

/**
 * Production requires the Git locator and API to share an origin. Local API
 * development may opt into one hosted Git origin explicitly; it never widens
 * the production trust rule implicitly.
 */
export function isTrustedCloudGitOrigin(
  remoteOrOrigin: string | null | undefined,
  apiBaseUrl: string | null | undefined,
): boolean {
  if (sameCloudOrigin(remoteOrOrigin, apiBaseUrl)) return true;
  if (!remoteOrOrigin || !isLoopbackOrigin(apiBaseUrl)) return false;
  const configuredGitOrigin = (
    import.meta as ImportMeta & { env?: Record<string, string | undefined> }
  ).env?.VITE_DESKTOP_CLOUD_GIT_ORIGIN?.trim();
  return Boolean(
    configuredGitOrigin
    && sameCloudOrigin(remoteOrOrigin, configuredGitOrigin),
  );
}

function isLoopbackOrigin(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    return ["localhost", "127.0.0.1", "::1"].includes(new URL(value).hostname);
  } catch {
    return false;
  }
}

export async function createExplicitWorkspaceBinding({
  session,
  apiBaseUrl,
  project,
  projectId,
  workspace,
  target,
  onSessionChange,
}: {
  session: DesktopCloudSession;
  apiBaseUrl: string | null;
  project?: DesktopCloudProject | null;
  projectId: string;
  workspace: Workspace;
  target?: RepositoryTarget;
  onSessionChange: MutableSessionHandler;
}): Promise<{
  binding: DesktopCloudWorkspaceBinding;
  remoteUrl: string;
  credential: string;
  username: string;
  project: DesktopCloudProject;
  bindingWasCreated: boolean;
}> {
  const workspaceInstanceId = workspace.workspaceInstanceId?.trim();
  if (!workspaceInstanceId) {
    throw new Error("This folder has no stable workspace identity yet.");
  }
  const resolvedTarget = target ?? projectRootTarget(projectId);
  if (resolvedTarget.project_id !== projectId) {
    throw new Error("The repository target does not belong to the selected Cloud Project.");
  }
  const resolvedProject = project?.id === projectId
    ? project
    : await getCloudProject(session, projectId, onSessionChange, apiBaseUrl);
  const mode = projectAllows(resolvedProject, "workspace.bind.readwrite") ? "rw" : "r";
  const origin = cloudOriginFromApiBase(apiBaseUrl ?? session.api_base_url);
  const binding = await createCloudWorkspaceBinding(
    session,
    projectId,
    {
      workspace_instance_id: workspaceInstanceId,
      cloud_origin: origin,
      target: resolvedTarget,
      mode,
    },
    onSessionChange,
    apiBaseUrl,
  );
  const bindingWasCreated = Boolean(binding.credential?.trim());
  let credentialIssued = bindingWasCreated;
  try {
    let credential = binding.credential?.trim() || "";
    if (!credential) {
      credential = await rotateCloudWorkspaceBindingCredential(
        session, binding.id, onSessionChange, apiBaseUrl,
      );
      credentialIssued = true;
    }
    const remoteUrl = binding.remote?.url?.trim();
    if (!remoteUrl || !sameCloudOrigin(remoteUrl, apiBaseUrl ?? session.api_base_url)) {
      throw new Error("Cloud binding returned an invalid Git remote locator.");
    }
    return {
      binding,
      remoteUrl,
      credential,
      username: binding.remote.username || "x-puppyone-token",
      project: resolvedProject,
      bindingWasCreated,
    };
  } catch (error) {
    if (bindingWasCreated) {
      await revokeCloudWorkspaceBinding(
        session, binding.id, onSessionChange, apiBaseUrl,
      ).catch(() => undefined);
    } else if (credentialIssued) {
      await revokeCloudWorkspaceBindingCredential(
        session, binding.id, onSessionChange, apiBaseUrl,
      ).catch(() => undefined);
    }
    throw error;
  }
}

export function bindingMatchesWorkspace({
  binding,
  workspace,
  configuredProjectId,
  configuredOrigin,
  expectedUserId,
}: {
  binding: DesktopCloudWorkspaceBinding;
  workspace: Workspace;
  configuredProjectId: string;
  configuredOrigin: string;
  expectedUserId: string;
}): boolean {
  return binding.id.length > 0
    && binding.target.project_id === configuredProjectId
    && binding.workspace_instance_id === workspace.workspaceInstanceId
    && binding.bound_user_id === expectedUserId
    && sameCloudOrigin(binding.cloud_origin, configuredOrigin)
    && sameRepositoryTarget(binding.remote.target, binding.target)
    && sameCloudOrigin(binding.remote.url, binding.cloud_origin);
}
