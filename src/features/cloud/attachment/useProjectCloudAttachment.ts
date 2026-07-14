import { useMemo } from "react";
import type { Workspace } from "@puppyone/shared-ui";
import type { GitStatusSnapshot, PuppyoneWorkspaceConfig } from "../../../types/electron";
import type { RecentWorkspaceCloudBinding } from "../workspace/cloudProjectResolution";
import { resolvePuppyoneRemotes } from "../../source-control/remotes";
import {
  resolveProjectCloudAttachment,
  type ProjectCloudAttachment,
} from "./projectCloudAttachment";
import type { DesktopCloudSession } from "../../../lib/cloudApi";
import { createWorkspaceCloudResolutionKey } from "../workspace/workspaceCloudResolutionKey";

/**
 * Derive ProjectCloudAttachment for the open Local workspace.
 *
 * recentWorkspaceCloudBindings is a cache/hint only — verified bindings come from
 * puppyoneConfig.cloud.projectId after the workspace binding resolver succeeds.
 */
export function useProjectCloudAttachment({
  workspace,
  workspaceIsCloud,
  puppyoneConfig,
  recentWorkspaceCloudBindings,
  activeGitStatus,
  activeCloudSession,
  desktopCloudApiBaseUrl,
  resolutionInputsLoading,
}: {
  workspace: Workspace | null;
  workspaceIsCloud: boolean;
  puppyoneConfig: PuppyoneWorkspaceConfig | null;
  recentWorkspaceCloudBindings: Record<string, RecentWorkspaceCloudBinding>;
  activeGitStatus: GitStatusSnapshot | null;
  activeCloudSession: DesktopCloudSession | null;
  desktopCloudApiBaseUrl: string | null;
  resolutionInputsLoading: boolean;
}): ProjectCloudAttachment {
  return useMemo(() => {
    if (!workspace || workspaceIsCloud) {
      return { status: "local-only", projectId: null };
    }

    const expectedResolutionKey = createWorkspaceCloudResolutionKey({
      activeCloudSession,
      activeGitStatus,
      desktopCloudApiBaseUrl,
      puppyoneConfig,
      workspace,
    });
    const cachedBinding = recentWorkspaceCloudBindings[workspace.id];
    const binding = cachedBinding?.resolutionKey === expectedResolutionKey
      ? cachedBinding
      : undefined;
    if (resolutionInputsLoading || (cachedBinding && !binding)) {
      return { status: "resolving", projectId: null };
    }
    // A config Project id is only an identity hint. The verified binding
    // controller is the sole source allowed to promote it into a linked state.
    const hasFormalConfigHint = Boolean(
      puppyoneConfig?.cloud.projectId
      && puppyoneConfig.cloud.bindingId
      && puppyoneConfig.cloud.origin,
    );
    const resolvedProjectId = binding?.resolutionSource && binding.bindingStatus
      ? binding.projectId?.trim() || null
      : null;
    const remoteProjectId = binding?.candidateProjectId?.trim() || null;
    const remoteResolution = resolvePuppyoneRemotes(activeGitStatus);
    const hasCloudRemote = remoteResolution.status !== "none";
    const hasCandidateSource = Boolean(
      resolvedProjectId
      || remoteProjectId
      || hasCloudRemote
      || binding?.cloudLinked
      || hasFormalConfigHint,
    );
    const resolving = binding?.resolutionPending === true || (
      hasCandidateSource
      && !resolvedProjectId
      && !binding?.error
      && (hasCloudRemote || hasFormalConfigHint)
    );

    return resolveProjectCloudAttachment({
      resolvedProjectId,
      remoteProjectId,
      bindingError: binding?.error ?? null,
      bindingReason: binding?.reason ?? null,
      bindingCloudLinked: Boolean(binding?.cloudLinked || hasCloudRemote),
      resolving,
      bindingId: binding?.bindingId ?? null,
      bindingKind: binding?.bindingKind ?? null,
      scopePath: binding?.scopePath ?? null,
      readiness: binding?.readiness ?? null,
      capabilities: binding?.capabilities ?? [],
      scopeId: binding?.scopeId ?? binding?.candidateScopeId ?? null,
      resolutionSource: binding?.resolutionSource ?? null,
      bindingStatus: binding?.bindingStatus ?? null,
    });
  }, [
    activeCloudSession,
    activeGitStatus,
    desktopCloudApiBaseUrl,
    puppyoneConfig,
    recentWorkspaceCloudBindings,
    resolutionInputsLoading,
    workspace,
    workspaceIsCloud,
  ]);
}
