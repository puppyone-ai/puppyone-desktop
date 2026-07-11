import {
  useEffect,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { Workspace } from "@puppyone/shared-ui";
import {
  listCloudProjects,
  type DesktopCloudProject,
  type DesktopCloudSession,
} from "../../../lib/cloudApi";
import type { GitStatusSnapshot, PuppyoneWorkspaceConfig } from "../../../types/electron";
import { mergePuppyoneWorkspaceConfig } from "../../app-shell/preferences";
import { getPuppyoneRemote } from "../../source-control/remotes";
import {
  resolveWorkspaceCloudProjectBinding,
  type RecentWorkspaceCloudBinding,
} from "./cloudProjectResolution";

/**
 * Single runtime owner for Local workspace → Cloud project binding.
 * Homepage `recentWorkspaceCloudBindings` is updated as a cache hint only.
 */
export function useCloudWorkspaceBinding({
  activeCloudSession,
  activeGitStatus,
  cloudEnabled,
  desktopCloudApiBaseUrl,
  handlePuppyoneConfigChange,
  homeCloudProjects,
  puppyoneConfig,
  setHomeCloudProjects,
  setRecentWorkspaceCloudBindings,
  updateCloudSession,
  workspace,
  workspaceIsCloud,
}: {
  activeCloudSession: DesktopCloudSession | null;
  activeGitStatus: GitStatusSnapshot | null;
  cloudEnabled: boolean;
  desktopCloudApiBaseUrl: string | null;
  handlePuppyoneConfigChange: (nextConfig: PuppyoneWorkspaceConfig) => Promise<PuppyoneWorkspaceConfig | null>;
  homeCloudProjects: DesktopCloudProject[];
  puppyoneConfig: PuppyoneWorkspaceConfig | null;
  setHomeCloudProjects: Dispatch<SetStateAction<DesktopCloudProject[]>>;
  setRecentWorkspaceCloudBindings: Dispatch<SetStateAction<Record<string, RecentWorkspaceCloudBinding>>>;
  updateCloudSession: (session: DesktopCloudSession | null) => void;
  workspace: Workspace | null;
  workspaceIsCloud: boolean;
}) {
  useEffect(() => {
    if (!workspace || workspaceIsCloud || !cloudEnabled || !activeGitStatus) return undefined;

    const cloudRemote = getPuppyoneRemote(activeGitStatus);
    if (!cloudRemote) {
      // No PuppyOne remote — clear stale linked cache for this workspace when
      // config also has no project id.
      const configuredProjectId = puppyoneConfig?.cloud.projectId?.trim() || null;
      if (!configuredProjectId) {
        setRecentWorkspaceCloudBindings((current) => {
          if (!current[workspace.id]) return current;
          const next = { ...current };
          delete next[workspace.id];
          return next;
        });
      }
      return undefined;
    }

    const configuredProjectId = puppyoneConfig?.cloud.projectId?.trim() || null;
    const sessionKey = [
      activeCloudSession?.user_email ?? "",
      activeCloudSession?.api_base_url ?? desktopCloudApiBaseUrl ?? "",
      cloudRemote.rawUrl,
      configuredProjectId ?? "",
    ].join("\n");

    const applyActiveBinding = (nextBinding: RecentWorkspaceCloudBinding) => {
      setRecentWorkspaceCloudBindings((current) => {
        const currentBinding = current[workspace.id];
        if (
          currentBinding?.projectId === nextBinding.projectId
          && currentBinding.cloudLinked === nextBinding.cloudLinked
          && currentBinding.error === nextBinding.error
          && (currentBinding.reason ?? null) === (nextBinding.reason ?? null)
        ) {
          return current;
        }
        return {
          ...current,
          [workspace.id]: nextBinding,
        };
      });
    };

    if (!activeCloudSession) {
      // Keep structural remote presence; do not auto-unbind on missing session.
      if (configuredProjectId) {
        applyActiveBinding({
          projectId: configuredProjectId,
          cloudLinked: true,
          error: null,
          reason: null,
        });
      } else {
        applyActiveBinding({
          projectId: null,
          cloudLinked: true,
          error: null,
          reason: null,
        });
      }
      return undefined;
    }

    let cancelled = false;
    void (async () => {
      const projects = homeCloudProjects.length > 0
        ? homeCloudProjects
        : await listCloudProjects(activeCloudSession, updateCloudSession, desktopCloudApiBaseUrl);
      if (cancelled) return;
      if (homeCloudProjects.length === 0) setHomeCloudProjects(projects);

      const resolution = await resolveWorkspaceCloudProjectBinding({
        activeGitStatus,
        apiBaseUrl: desktopCloudApiBaseUrl,
        configuredProjectId,
        onSessionChange: updateCloudSession,
        projects,
        session: activeCloudSession,
        workspace,
      });
      if (cancelled) return;

      if (resolution.status === "mapped") {
        applyActiveBinding({
          projectId: resolution.projectId,
          cloudLinked: true,
          error: null,
          reason: null,
        });
        if (configuredProjectId !== resolution.projectId) {
          const nextConfig = mergePuppyoneWorkspaceConfig(puppyoneConfig, {
            cloud: {
              projectId: resolution.projectId,
            },
          });
          await handlePuppyoneConfigChange(nextConfig);
        }
        return;
      }

      if (resolution.status === "not-authorized") {
        applyActiveBinding({
          projectId: null,
          cloudLinked: true,
          error: resolution.message,
          reason: "not-authorized",
        });
        // Do not persist unauthorized candidate ids into workspace config.
        return;
      }

      if (resolution.status === "unresolvable") {
        applyActiveBinding({
          projectId: null,
          cloudLinked: true,
          error: resolution.message,
          reason: "unresolvable",
        });
        return;
      }

      applyActiveBinding({
        projectId: null,
        cloudLinked: false,
        error: null,
        reason: null,
      });
    })()
      .catch((error) => {
        if (cancelled) return;
        // Network failures must not erase a previously verified binding.
        applyActiveBinding({
          projectId: configuredProjectId,
          cloudLinked: true,
          error: error instanceof Error ? error.message : String(error),
          reason: configuredProjectId ? "network" : "unresolvable",
        });
      });

    return () => {
      cancelled = true;
      void sessionKey;
    };
  }, [
    activeCloudSession,
    activeGitStatus,
    cloudEnabled,
    desktopCloudApiBaseUrl,
    handlePuppyoneConfigChange,
    homeCloudProjects,
    puppyoneConfig,
    setHomeCloudProjects,
    setRecentWorkspaceCloudBindings,
    updateCloudSession,
    workspace,
    workspaceIsCloud,
  ]);
}
