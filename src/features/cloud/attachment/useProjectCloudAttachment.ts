import { useMemo } from "react";
import type { Workspace } from "@puppyone/shared-ui";
import type { GitStatusSnapshot, PuppyoneWorkspaceConfig } from "../../../types/electron";
import type { RecentWorkspaceCloudBinding } from "../workspace/cloudProjectResolution";
import { getPuppyoneRemote } from "../../source-control/remotes";
import {
  resolveProjectCloudAttachment,
  type ProjectCloudAttachment,
} from "./projectCloudAttachment";

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
}: {
  workspace: Workspace | null;
  workspaceIsCloud: boolean;
  puppyoneConfig: PuppyoneWorkspaceConfig | null;
  recentWorkspaceCloudBindings: Record<string, RecentWorkspaceCloudBinding>;
  activeGitStatus: GitStatusSnapshot | null;
}): ProjectCloudAttachment {
  return useMemo(() => {
    if (!workspace || workspaceIsCloud) {
      return { status: "local-only", projectId: null };
    }

    const binding = recentWorkspaceCloudBindings[workspace.id];
    // A config Project id is only an identity hint. The verified binding
    // controller is the sole source allowed to promote it into a linked state.
    const configuredProjectId = null;
    const hasFormalConfigHint = Boolean(
      puppyoneConfig?.cloud.projectId
      && puppyoneConfig.cloud.bindingId
      && puppyoneConfig.cloud.origin,
    );
    const bindingProjectId = binding?.projectId?.trim() || null;
    const remoteProjectId = binding?.candidateProjectId?.trim() || null;
    const hasCloudRemote = Boolean(getPuppyoneRemote(activeGitStatus));
    const hasCandidateSource = Boolean(
      configuredProjectId
      || bindingProjectId
      || remoteProjectId
      || hasCloudRemote
      || binding?.cloudLinked
      || hasFormalConfigHint,
    );
    const resolving = hasCandidateSource
      && !configuredProjectId
      && !bindingProjectId
      && !binding?.error
      && (hasCloudRemote || hasFormalConfigHint);

    return resolveProjectCloudAttachment({
      configuredProjectId,
      bindingProjectId,
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
      scopeId: binding?.candidateScopeId ?? null,
    });
  }, [
    activeGitStatus,
    puppyoneConfig?.cloud.bindingId,
    puppyoneConfig?.cloud.origin,
    puppyoneConfig?.cloud.projectId,
    recentWorkspaceCloudBindings,
    workspace,
    workspaceIsCloud,
  ]);
}
