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
      && !remoteProjectId
      && !binding?.error;

    return resolveProjectCloudAttachment({
      configuredProjectId,
      bindingProjectId,
      remoteProjectId,
      bindingError: binding?.error ?? null,
      bindingCloudLinked: Boolean(binding?.cloudLinked),
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
