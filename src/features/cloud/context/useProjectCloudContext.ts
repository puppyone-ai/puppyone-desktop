import { useMemo } from "react";
import type { Workspace } from "@puppyone/shared-ui";
import type { GitStatusSnapshot } from "../../../types/electron";
import type { RecentWorkspaceCloudContext } from "../workspace/cloudProjectResolution";
import { resolveCanonicalPuppyoneRemotes } from "../../source-control/remotes";
import {
  resolveProjectCloudContext,
  type ProjectCloudContext,
} from "./projectCloudContext";
import type { DesktopCloudSession } from "../../../lib/cloudApi";
import { createWorkspaceCloudResolutionKey } from "../workspace/workspaceCloudResolutionKey";

export function useProjectCloudContext({
  workspace,
  workspaceIsCloud,
  recentWorkspaceCloudContexts,
  activeGitStatus,
  activeCloudSession,
  desktopCloudApiBaseUrl,
  resolutionInputsLoading,
}: {
  workspace: Workspace | null;
  workspaceIsCloud: boolean;
  recentWorkspaceCloudContexts: Record<string, RecentWorkspaceCloudContext>;
  activeGitStatus: GitStatusSnapshot | null;
  activeCloudSession: DesktopCloudSession | null;
  desktopCloudApiBaseUrl: string | null;
  resolutionInputsLoading: boolean;
}): ProjectCloudContext {
  return useMemo(() => {
    if (!workspace || workspaceIsCloud) return { status: "local-only", projectId: null };
    const expectedKey = createWorkspaceCloudResolutionKey({
      activeCloudSession,
      activeGitStatus,
      desktopCloudApiBaseUrl,
      workspace,
    });
    const cached = recentWorkspaceCloudContexts[workspace.id];
    const context = cached?.resolutionKey === expectedKey ? cached : undefined;
    if (resolutionInputsLoading || (cached && !context)) {
      return { status: "resolving", projectId: null };
    }
    const remoteResolution = resolveCanonicalPuppyoneRemotes(activeGitStatus);
    return resolveProjectCloudContext({
      resolvedProjectId: context?.projectId?.trim() || null,
      remoteProjectId: context?.candidateProjectId?.trim() || null,
      contextError: context?.error ?? null,
      contextReason: context?.reason ?? null,
      hasCanonicalRemote: remoteResolution.status !== "none",
      resolving: context?.resolutionPending === true,
      target: context?.target ?? null,
      scopePath: context?.scopePath ?? null,
      readiness: context?.readiness ?? null,
      capabilities: context?.capabilities ?? [],
    });
  }, [
    activeCloudSession,
    activeGitStatus,
    desktopCloudApiBaseUrl,
    recentWorkspaceCloudContexts,
    resolutionInputsLoading,
    workspace,
    workspaceIsCloud,
  ]);
}
