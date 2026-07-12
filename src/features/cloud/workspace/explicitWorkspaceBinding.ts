import type { Workspace } from "@puppyone/shared-ui";
import {
  createCloudWorkspaceBinding,
  getCloudProject,
  projectAllows,
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

export function bindingCredentialRemoteUrl(remoteUrl: string, credential: string): string {
  const token = credential.trim();
  if (!token) throw new Error("Cloud binding did not return a credential.");
  const parsed = new URL(remoteUrl);
  const marker = "/git/ap/";
  const markerIndex = parsed.pathname.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error("Cloud Git remote is not an Access remote.");
  }
  const suffix = parsed.pathname.toLowerCase().endsWith(".git") ? ".git" : "";
  parsed.pathname = `${parsed.pathname.slice(0, markerIndex)}${marker}${encodeURIComponent(token)}${suffix}`;
  parsed.username = "";
  parsed.password = "";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

export async function createExplicitWorkspaceBinding({
  session,
  apiBaseUrl,
  project,
  projectId,
  workspace,
  remoteUrl,
  bindingKind = "full",
  scopeId = null,
  onSessionChange,
}: {
  session: DesktopCloudSession;
  apiBaseUrl: string | null;
  project?: DesktopCloudProject | null;
  projectId: string;
  workspace: Workspace;
  remoteUrl: string;
  bindingKind?: "full" | "scoped";
  scopeId?: string | null;
  onSessionChange: MutableSessionHandler;
}): Promise<{
  binding: DesktopCloudWorkspaceBinding;
  credentialRemoteUrl: string;
  project: DesktopCloudProject;
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
  let credential = binding.credential?.trim() || "";
  if (!credential) {
    credential = await rotateCloudWorkspaceBindingCredential(
      session, binding.id, onSessionChange, apiBaseUrl,
    );
  }
  return {
    binding,
    credentialRemoteUrl: bindingCredentialRemoteUrl(remoteUrl, credential),
    project: resolvedProject,
  };
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
