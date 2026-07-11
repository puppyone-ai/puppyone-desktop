import { useMemo } from "react";
import type { Workspace } from "@puppyone/shared-ui";
import type { GitStatusSnapshot, PuppyoneWorkspaceConfig } from "../../../types/electron";
import {
  getPuppyoneRemoteProjectId,
  type RecentWorkspaceCloudBinding,
} from "../workspace/cloudProjectResolution";
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
    const configuredProjectId = puppyoneConfig?.cloud.projectId?.trim() || null;
    // Runtime authorization fact: only configured (persisted after verify) or
    // currently resolving binding project ids. Never promote a raw remote path
    // id into a linked attachment without accessible-project verification.
    const bindingProjectId = binding?.projectId?.trim() || null;
    const remoteProjectId = getPuppyoneRemoteProjectId(activeGitStatus);
    const hasCloudRemote = Boolean(getPuppyoneRemote(activeGitStatus));
    const hasCandidateSource = Boolean(
      configuredProjectId
      || bindingProjectId
      || remoteProjectId
      || hasCloudRemote
      || binding?.cloudLinked,
    );
    const resolving = hasCandidateSource
      && !configuredProjectId
      && !bindingProjectId
      && !binding?.error
      && hasCloudRemote;

    return resolveProjectCloudAttachment({
      configuredProjectId,
      bindingProjectId,
      remoteProjectId,
      bindingError: binding?.error ?? null,
      bindingReason: binding?.reason ?? null,
      bindingCloudLinked: Boolean(binding?.cloudLinked || hasCloudRemote),
      resolving,
    });
  }, [
    activeGitStatus,
    puppyoneConfig?.cloud.projectId,
    recentWorkspaceCloudBindings,
    workspace,
    workspaceIsCloud,
  ]);
}
