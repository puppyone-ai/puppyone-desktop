import type { RecentWorkspaceHomeItem } from "../../../components/MinimalOnboarding";
import {
  getCloudRepositoryContext,
  getCloudProjectReadiness,
  type DesktopCloudProject,
  type DesktopCloudProjectReadiness,
  type DesktopCloudSession,
} from "../../../lib/cloudApi";
import type { RepositoryTarget } from "../repositoryTarget";
import { repositoryTargetMatchesRemote } from "../repositoryTarget";
import { cloudMessage, type CloudMessageDescriptor } from "../cloudPresentation";
import { isTrustedCloudGitOrigin } from "./workspaceGitRemote";

export type RecentWorkspaceCloudContext = {
  projectId: string | null;
  resolutionKey?: string;
  resolutionPending?: boolean;
  hasCloudRemote: boolean;
  error: CloudMessageDescriptor | null;
  reason?:
    | "not-authorized"
    | "unresolvable"
    | "network"
    | "wrong-account"
    | "wrong-host"
    | "locator-conflict"
    | "not-found"
    | null;
  target?: RepositoryTarget | null;
  scopePath?: string | null;
  readiness?: DesktopCloudProjectReadiness | null;
  candidateProjectId?: string | null;
  capabilities?: string[];
};

export const CLOUD_PROJECT_NOT_AUTHORIZED_MESSAGE = cloudMessage("remote-not-authorized");
export const CLOUD_PROJECT_UNRESOLVABLE_MESSAGE = cloudMessage("remote-unresolvable");
export const CLOUD_PROJECT_MAPPING_ERROR = CLOUD_PROJECT_UNRESOLVABLE_MESSAGE;

export function shouldLoadCloudProjectCatalog({
  hasOpenWorkspace,
  workspaceIsCloud,
  workspaceRestoring = false,
}: {
  hasOpenWorkspace: boolean;
  workspaceIsCloud: boolean;
  workspaceRestoring?: boolean;
}): boolean {
  return !workspaceRestoring && (!hasOpenWorkspace || workspaceIsCloud);
}

function errorStatus(error: unknown): number | null {
  return error && typeof error === "object" && "status" in error
    ? Number((error as { status?: unknown }).status) || null
    : null;
}

export function isRetryableCloudFailure(status: number | null): boolean {
  return status == null || status === 408 || status === 425 || status === 429 || status >= 500;
}

/** Resolve a recent-workspace badge from its secret-free canonical Git hint. */
export async function resolveRecentWorkspaceCloudContext({
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
}): Promise<[string, RecentWorkspaceCloudContext]> {
  const remote = item.workspace.puppyoneGitRemote ?? null;
  if (!remote) {
    return [item.workspace.id, {
      projectId: null,
      hasCloudRemote: false,
      error: null,
      reason: null,
    }];
  }

  if (!isTrustedCloudGitOrigin(remote.origin, apiBaseUrl ?? session?.api_base_url)) {
    return [item.workspace.id, {
      projectId: null,
      candidateProjectId: remote.projectId,
      hasCloudRemote: true,
      error: cloudMessage("remote-wrong-host", { origin: remote.origin }),
      reason: "wrong-host",
    }];
  }
  if (!session) {
    return [item.workspace.id, {
      projectId: null,
      candidateProjectId: remote.projectId,
      hasCloudRemote: true,
      error: cloudMessage("remote-sign-in"),
      reason: "wrong-account",
    }];
  }

  const target: RepositoryTarget = remote.scopeId
    ? { kind: "scope", project_id: remote.projectId, scope_id: remote.scopeId }
    : { kind: "project_root", project_id: remote.projectId };
  try {
    const context = await getCloudRepositoryContext(
      session, remote.projectId, target, onSessionChange, apiBaseUrl,
    );
    if (
      context.project.id !== remote.projectId
      || !repositoryTargetMatchesRemote(context.target, {
        kind: remote.scopeId ? "scope" : "project",
        projectId: remote.projectId,
        ...(remote.scopeId ? { scopeId: remote.scopeId } : {}),
      })
    ) {
      return [item.workspace.id, {
        projectId: null,
        candidateProjectId: remote.projectId,
        hasCloudRemote: true,
        error: cloudMessage("remote-response-mismatch"),
        reason: "locator-conflict",
      }];
    }
    const readiness = await getCloudProjectReadiness(
      session, context.project.id, onSessionChange, apiBaseUrl,
    );
    return [item.workspace.id, {
      projectId: context.project.id,
      target: context.target,
      scopePath: context.scope_path ?? null,
      readiness,
      capabilities: context.project.capabilities ?? [],
      hasCloudRemote: true,
      error: null,
      reason: null,
    }];
  } catch (error) {
    const status = errorStatus(error);
    return [item.workspace.id, {
      projectId: null,
      candidateProjectId: remote.projectId,
      hasCloudRemote: true,
      error: status === 401
        ? cloudMessage("remote-sign-in")
        : status === 403
          ? cloudMessage("remote-not-authorized")
          : status === 404
            ? cloudMessage("remote-not-found")
            : cloudMessage(
                isRetryableCloudFailure(status) ? "remote-network-failed" : "remote-unresolvable",
                undefined,
                error instanceof Error ? error.message : String(error),
              ),
      reason: status === 401
        ? "wrong-account"
        : status === 403
          ? "not-authorized"
          : status === 404
            ? "not-found"
            : isRetryableCloudFailure(status) ? "network" : "unresolvable",
    }];
  }
}
