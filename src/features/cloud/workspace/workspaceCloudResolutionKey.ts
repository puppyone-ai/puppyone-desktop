import type { Workspace } from "@puppyone/shared-ui";
import type { DesktopCloudSession } from "../../../lib/cloudApi";
import type { GitStatusSnapshot, PuppyoneWorkspaceConfig } from "../../../types/electron";
import { resolvePuppyoneRemotes, type PuppyoneRemoteCandidate } from "../../source-control/remotes";

/**
 * Build a secret-free identity key for one contextual resolution snapshot.
 *
 * The key is kept in renderer memory only. It prevents a result authorized for
 * an earlier workspace, account, host, config, or Git locator from being
 * promoted while the next resolver effect is still starting.
 */
export function createWorkspaceCloudResolutionKey({
  activeCloudSession,
  activeGitStatus,
  desktopCloudApiBaseUrl,
  puppyoneConfig,
  workspace,
}: {
  activeCloudSession: DesktopCloudSession | null;
  activeGitStatus: GitStatusSnapshot | null;
  desktopCloudApiBaseUrl: string | null;
  puppyoneConfig: PuppyoneWorkspaceConfig | null;
  workspace: Workspace;
}): string {
  const remoteResolution = resolvePuppyoneRemotes(activeGitStatus);
  const remoteFacts = remoteResolution.candidates
    .map(secretFreeRemoteFact)
    .sort();

  return JSON.stringify([
    workspace.id,
    workspace.path,
    workspace.workspaceInstanceId?.trim() || "",
    puppyoneConfig?.project.workspaceInstanceId?.trim() || "",
    puppyoneConfig?.cloud.projectId?.trim() || "",
    puppyoneConfig?.cloud.bindingId?.trim() || "",
    normalizeOrigin(puppyoneConfig?.cloud.origin),
    activeCloudSession?.user_id ?? "",
    activeCloudSession?.session_generation ?? "",
    normalizeOrigin(desktopCloudApiBaseUrl ?? activeCloudSession?.api_base_url),
    remoteResolution.status,
    remoteFacts,
  ]);
}

/**
 * Block contextual Cloud resolution only until the first Git snapshot for the
 * active workspace exists. Background watcher refreshes keep the previous
 * snapshot usable, so they must not tear down an already-authorized Project
 * context or flash the workspace back to "Matching folder".
 */
export function shouldBlockWorkspaceCloudResolution({
  gitStatusError,
  gitStatusPath,
  puppyoneConfigLoading,
  workspacePath,
}: {
  gitStatusError: string | null;
  gitStatusPath: string | null;
  puppyoneConfigLoading: boolean;
  workspacePath: string | null;
}): boolean {
  if (!workspacePath) return false;
  if (puppyoneConfigLoading) return true;
  if (gitStatusPath === workspacePath) return false;
  // A failed initial Git read cannot be repaired by an indefinite Cloud
  // spinner. Continue with config-only resolution and surface the Git error in
  // its normal workspace error channel.
  return !gitStatusError;
}

function secretFreeRemoteFact(candidate: PuppyoneRemoteCandidate): string {
  const { info } = candidate;
  const locator = info.kind === "project"
    ? [info.projectId ?? ""]
    : info.kind === "scope"
      ? [info.projectId ?? "", info.scopeId ?? ""]
      // displayId is already masked; never place the legacy access key or raw
      // URL in a context key, log, manifest, or error.
      : [info.displayId];
  return JSON.stringify([
    candidate.remote.name,
    candidate.direction,
    info.origin,
    info.kind,
    ...locator,
  ]);
}

function normalizeOrigin(value: string | null | undefined): string {
  if (!value) return "";
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
}
