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

export async function createExplicitWorkspaceBinding({
  session,
  apiBaseUrl,
  project,
  projectId,
  workspace,
  bindingKind = "full",
  scopeId = null,
  onSessionChange,
}: {
  session: DesktopCloudSession;
  apiBaseUrl: string | null;
  project?: DesktopCloudProject | null;
  projectId: string;
  workspace: Workspace;
  bindingKind?: "full" | "scoped";
  scopeId?: string | null;
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
  if (bindingKind === "scoped" && !scopeId?.trim()) {
    throw new Error("A scoped workspace binding requires an explicit Cloud scope.");
  }
  if (bindingKind === "full" && scopeId) {
    throw new Error("A full workspace binding must resolve the canonical root scope on the server.");
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
      binding_kind: bindingKind,
      scope_id: bindingKind === "scoped" ? scopeId : null,
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
}: {
  binding: DesktopCloudWorkspaceBinding;
  workspace: Workspace;
  configuredProjectId: string;
  configuredOrigin: string;
}): boolean {
  return binding.id.length > 0
    && binding.project_id === configuredProjectId
    && binding.workspace_instance_id === workspace.workspaceInstanceId
    && sameCloudOrigin(binding.cloud_origin, configuredOrigin);
}
