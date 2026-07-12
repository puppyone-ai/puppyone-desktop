import type { RecentWorkspaceHomeItem } from "../../../components/MinimalOnboarding";
import {
  getCloudProjectReadiness,
  getCloudWorkspaceBinding,
  type DesktopCloudProject,
  type DesktopCloudProjectReadiness,
  type DesktopCloudSession,
} from "../../../lib/cloudApi";
import { sameCloudOrigin } from "./explicitWorkspaceBinding";

export type RecentWorkspaceCloudBinding = {
  projectId: string | null;
  cloudLinked: boolean;
  error: string | null;
  reason?:
    | "not-authorized"
    | "unresolvable"
    | "network"
    | "binding-revoked"
    | "wrong-account"
    | "wrong-host"
    | "role-downgraded"
    | "legacy-confirmation-required"
    | null;
  bindingId?: string | null;
  bindingKind?: "full" | "scoped" | null;
  scopePath?: string | null;
  readiness?: DesktopCloudProjectReadiness | null;
  candidateProjectId?: string | null;
  candidateScopeId?: string | null;
  capabilities?: string[];
};

export const CLOUD_PROJECT_NOT_AUTHORIZED_MESSAGE =
  "You don’t have access to the Cloud project linked to this folder.";
export const CLOUD_PROJECT_UNRESOLVABLE_MESSAGE =
  "This legacy Cloud remote needs an explicit Project binding.";
export const CLOUD_PROJECT_MAPPING_ERROR = CLOUD_PROJECT_UNRESOLVABLE_MESSAGE;

function errorStatus(error: unknown): number | null {
  return error && typeof error === "object" && "status" in error
    ? Number((error as { status?: unknown }).status) || null
    : null;
}

/** Resolve homepage badges from explicit binding facts only. */
export async function resolveRecentWorkspaceCloudBinding({
  apiBaseUrl,
  item,
  onSessionChange,
  projects: _projects,
  session,
}: {
  apiBaseUrl: string | null;
  item: RecentWorkspaceHomeItem;
  onSessionChange: (session: DesktopCloudSession | null) => void;
  projects: DesktopCloudProject[];
  session: DesktopCloudSession | null;
}): Promise<[string, RecentWorkspaceCloudBinding]> {
  // These are non-authoritative hints hydrated by the main process from its
  // persisted recent-workspace list. Never probe an inactive folder through
  // the current window's workspace IPC capability.
  const projectId = item.workspace.cloudProjectId?.trim() || null;
  const bindingId = item.workspace.cloudBindingId?.trim() || null;
  const origin = item.workspace.cloudBindingOrigin?.trim() || null;
  const configuredInstance = item.workspace.cloudBindingWorkspaceInstanceId?.trim() || null;
  const workspaceInstance = item.workspace.workspaceInstanceId?.trim() || null;
  const configError = item.workspace.configError ?? null;

  if (projectId && bindingId && origin) {
    if (!sameCloudOrigin(origin, apiBaseUrl ?? session?.api_base_url)) {
      return [item.workspace.id, {
        projectId: null,
        candidateProjectId: projectId,
        bindingId,
        cloudLinked: true,
        error: `Switch to the Cloud host used by this binding (${origin}).`,
        reason: "wrong-host",
      }];
    }
    if (!configuredInstance || !workspaceInstance || configuredInstance !== workspaceInstance) {
      return [item.workspace.id, {
        projectId: null,
        candidateProjectId: projectId,
        bindingId,
        cloudLinked: true,
        error: "This binding belongs to another local checkout.",
        reason: "binding-revoked",
      }];
    }
    if (!session) {
      return [item.workspace.id, {
        projectId,
        bindingId,
        cloudLinked: true,
        error: null,
        reason: null,
      }];
    }
    try {
      const binding = await getCloudWorkspaceBinding(
        session, bindingId, onSessionChange, apiBaseUrl,
      );
      if (
        binding.project_id !== projectId
        || binding.workspace_instance_id !== workspaceInstance
        || !binding.usable
      ) {
        return [item.workspace.id, {
          projectId: null,
          candidateProjectId: projectId,
          bindingId,
          bindingKind: binding.binding_kind,
          scopePath: binding.scope_path ?? null,
          cloudLinked: true,
          error: CLOUD_PROJECT_NOT_AUTHORIZED_MESSAGE,
          reason: binding.unusable_reason === "wrong_account" ? "wrong-account" : "binding-revoked",
        }];
      }
      const readiness = await getCloudProjectReadiness(
        session, projectId, onSessionChange, apiBaseUrl,
      );
      return [item.workspace.id, {
        projectId,
        bindingId,
        bindingKind: binding.binding_kind,
        scopePath: binding.scope_path ?? null,
        readiness,
        cloudLinked: true,
        error: null,
        reason: null,
      }];
    } catch (error) {
      const status = errorStatus(error);
      return [item.workspace.id, {
        projectId: status == null ? projectId : null,
        candidateProjectId: projectId,
        bindingId,
        cloudLinked: true,
        error: error instanceof Error ? error.message : String(error),
        reason: status === 401 ? "wrong-account" : status === 403 || status === 404 ? "not-authorized" : "network",
      }];
    }
  }

  if (item.workspace.hasPuppyoneCloudRemote === true) {
    return [item.workspace.id, {
      projectId: null,
      cloudLinked: true,
      error: CLOUD_PROJECT_UNRESOLVABLE_MESSAGE,
      reason: "legacy-confirmation-required",
    }];
  }
  return [item.workspace.id, {
    projectId: null,
    cloudLinked: false,
    error: configError,
    reason: null,
  }];
}
