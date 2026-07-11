import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { Workspace } from "@puppyone/shared-ui";
import type { RecentWorkspaceHomeItem, OnboardingOperationStatus } from "../../../components/MinimalOnboarding";
import {
  listCloudProjects,
  type DesktopCloudProject,
  type DesktopCloudSession,
} from "../../../lib/cloudApi";
import {
  readPuppyoneWorkspaceConfig,
  writePuppyoneWorkspaceConfig,
} from "../../../lib/localFiles";
import {
  openWorkspaceTarget,
  selectLocalWorkspaceFolder,
} from "../../../lib/workspaceOpening";
import type { PuppyoneWorkspaceConfig, GitStatusSnapshot, WorkspaceOpenResult } from "../../../types/electron";
import {
  mergePuppyoneWorkspaceConfig,
} from "../../app-shell/preferences";
import type { DesktopWorkspaceSurfaceAction } from "../../app-shell/navigation";
import {
  getPuppyoneRemoteProjectId,
  CLOUD_PROJECT_MAPPING_ERROR,
  resolveWorkspaceCloudProjectId,
  type RecentWorkspaceCloudBinding,
} from "./cloudProjectResolution";
import { getPuppyoneRemote } from "../../source-control/remotes";
import { getGitHostingMode } from "../../source-control/viewModel";
import { findRecentLocalWorkspaceBindingForCloudProject } from "../../app-shell/workspaceHomeModel";

const CLOUD_PROJECT_RESOLVING_MESSAGE = "Resolving Cloud project...";
const CLOUD_PROJECT_SWITCH_RESOLVE_TIMEOUT_MS = 15000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: number | null = null;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId !== null) window.clearTimeout(timeoutId);
  });
}

export function useWorkspaceSurfaceSwitch({
  activeCloudSession,
  activeGitStatus,
  cloudEnabled,
  cloudOnlyWorkspaceEnabled = false,
  cloudProjectId,
  desktopCloudApiBaseUrl,
  handlePuppyoneConfigChange,
  handleWorkspaceOpenResult,
  homeCloudProjects,
  openCloudProjectFromHomepage,
  puppyoneConfig,
  recentWorkspaceCloudBindings,
  recentWorkspaceItems,
  refreshRecentWorkspaceList,
  setHomeCloudProjects,
  setHomeOperationStatus,
  setRecentWorkspaceCloudBindings,
  showBrowserSignInStatus,
  startCloudBrowserSignIn,
  updateCloudSession,
  workspace,
  workspaceIsCloud,
}: {
  activeCloudSession: DesktopCloudSession | null;
  activeGitStatus: GitStatusSnapshot | null;
  cloudEnabled: boolean;
  cloudOnlyWorkspaceEnabled?: boolean;
  cloudProjectId: string | null;
  desktopCloudApiBaseUrl: string | null;
  handlePuppyoneConfigChange: (nextConfig: PuppyoneWorkspaceConfig) => Promise<PuppyoneWorkspaceConfig | null>;
  handleWorkspaceOpenResult: (result: WorkspaceOpenResult | null) => void;
  homeCloudProjects: DesktopCloudProject[];
  openCloudProjectFromHomepage: (projectId: string) => Promise<void>;
  puppyoneConfig: PuppyoneWorkspaceConfig | null;
  recentWorkspaceCloudBindings: Record<string, RecentWorkspaceCloudBinding>;
  recentWorkspaceItems: RecentWorkspaceHomeItem[];
  refreshRecentWorkspaceList: () => Promise<void>;
  setHomeCloudProjects: Dispatch<SetStateAction<DesktopCloudProject[]>>;
  setHomeOperationStatus: Dispatch<SetStateAction<OnboardingOperationStatus | null>>;
  setRecentWorkspaceCloudBindings: Dispatch<SetStateAction<Record<string, RecentWorkspaceCloudBinding>>>;
  showBrowserSignInStatus: (detail: string) => void;
  startCloudBrowserSignIn: () => Promise<void>;
  updateCloudSession: (session: DesktopCloudSession | null) => void;
  workspace: Workspace | null;
  workspaceIsCloud: boolean;
}) {
  const [workspaceSurfaceSwitching, setWorkspaceSurfaceSwitching] = useState(false);
  const [workspaceSurfaceError, setWorkspaceSurfaceError] = useState<string | null>(null);
  const [workspaceSurfaceDialogOpen, setWorkspaceSurfaceDialogOpen] = useState(false);

  const activeLocalCloudProjectId = useMemo(() => {
    if (!workspace || workspaceIsCloud) return null;
    return puppyoneConfig?.cloud.projectId?.trim()
      || recentWorkspaceCloudBindings[workspace.id]?.projectId?.trim()
      || getPuppyoneRemoteProjectId(activeGitStatus);
  }, [
    activeGitStatus,
    puppyoneConfig?.cloud.projectId,
    recentWorkspaceCloudBindings,
    workspace,
    workspaceIsCloud,
  ]);
  const activeLocalCloudLinked = useMemo(() => (
    Boolean(activeLocalCloudProjectId)
  ), [activeLocalCloudProjectId]);
  const activeLocalCloudHostAvailable = useMemo(() => {
    if (!workspace || workspaceIsCloud) return false;
    return activeLocalCloudLinked || getGitHostingMode(activeGitStatus, puppyoneConfig) === "puppyone-cloud";
  }, [
    activeGitStatus,
    activeLocalCloudLinked,
    puppyoneConfig,
    workspace,
    workspaceIsCloud,
  ]);
  const activeCloudLocalBinding = useMemo(() => (
    findRecentLocalWorkspaceBindingForCloudProject({
      bindings: recentWorkspaceCloudBindings,
      projectId: workspaceIsCloud ? cloudProjectId : null,
      recentWorkspaceItems,
    })
  ), [cloudProjectId, recentWorkspaceCloudBindings, recentWorkspaceItems, workspaceIsCloud]);

  useEffect(() => {
    setWorkspaceSurfaceSwitching(false);
    setWorkspaceSurfaceError(null);
    setWorkspaceSurfaceDialogOpen(false);
  }, [workspace?.path]);

  useEffect(() => {
    if (!workspace || workspaceIsCloud || !cloudEnabled || !activeGitStatus) return undefined;

    const cloudRemote = getPuppyoneRemote(activeGitStatus);
    if (!cloudRemote) return undefined;

    const configuredProjectId = puppyoneConfig?.cloud.projectId?.trim() || null;
    const applyActiveBinding = (
      projectId: string | null,
      error: string | null = null,
      cloudLinked = Boolean(projectId),
    ) => {
      setRecentWorkspaceCloudBindings((current) => {
        const nextBinding: RecentWorkspaceCloudBinding = {
          projectId,
          cloudLinked,
          error,
        };
        const currentBinding = current[workspace.id];
        if (
          currentBinding?.projectId === nextBinding.projectId &&
          currentBinding.cloudLinked === nextBinding.cloudLinked &&
          currentBinding.error === nextBinding.error
        ) {
          return current;
        }
        return {
          ...current,
          [workspace.id]: nextBinding,
        };
      });
    };
    const applyBindingError = (message: string) => {
      setRecentWorkspaceCloudBindings((current) => {
        const currentBinding = current[workspace.id];
        const nextBinding: RecentWorkspaceCloudBinding = {
          projectId: currentBinding?.projectId ?? null,
          cloudLinked: true,
          error: message,
        };
        if (
          currentBinding?.projectId === nextBinding.projectId
          && currentBinding.cloudLinked === nextBinding.cloudLinked
          && currentBinding.error === nextBinding.error
        ) {
          return current;
        }
        return {
          ...current,
          [workspace.id]: nextBinding,
        };
      });
    };

    if (configuredProjectId) {
      applyActiveBinding(configuredProjectId, null, true);
      return undefined;
    }

    if (cloudRemote.info.kind === "project") {
      const remoteProjectId = cloudRemote.info.projectId?.trim() || null;
      applyActiveBinding(
        remoteProjectId,
        remoteProjectId ? null : CLOUD_PROJECT_MAPPING_ERROR,
        true,
      );
      return undefined;
    }

    if (!activeCloudSession) {
      // Authentication availability must not erase a structural Cloud binding.
      // The attachment model can remain unresolved until the account comes back.
      return undefined;
    }

    let cancelled = false;
    void (async () => {
      const projects = homeCloudProjects.length > 0
        ? homeCloudProjects
        : await listCloudProjects(activeCloudSession, updateCloudSession, desktopCloudApiBaseUrl);
      if (cancelled) return;
      if (homeCloudProjects.length === 0) setHomeCloudProjects(projects);

      const projectId = await resolveWorkspaceCloudProjectId({
        activeGitStatus,
        apiBaseUrl: desktopCloudApiBaseUrl,
        configuredProjectId,
        onSessionChange: updateCloudSession,
        projects,
        session: activeCloudSession,
        workspace,
      });
      if (cancelled) return;

      if (!projectId) {
        applyActiveBinding(null, CLOUD_PROJECT_MAPPING_ERROR, true);
        return;
      }

      applyActiveBinding(projectId, null, true);
      if (projectId && configuredProjectId !== projectId) {
        const nextConfig = mergePuppyoneWorkspaceConfig(puppyoneConfig, {
          cloud: {
            projectId,
          },
        });
        await handlePuppyoneConfigChange(nextConfig);
      }
    })()
      .catch((error) => {
        if (!cancelled) {
          applyBindingError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [
    activeCloudSession,
    activeGitStatus,
    cloudEnabled,
    desktopCloudApiBaseUrl,
    handlePuppyoneConfigChange,
    homeCloudProjects,
    puppyoneConfig,
    puppyoneConfig?.cloud.projectId,
    setHomeCloudProjects,
    setRecentWorkspaceCloudBindings,
    updateCloudSession,
    workspace,
    workspaceIsCloud,
  ]);

  const switchToCloudProjectSurface = useCallback(() => {
    if (workspaceSurfaceSwitching) return;
    void (async () => {
      setWorkspaceSurfaceSwitching(true);
      setWorkspaceSurfaceDialogOpen(true);
      let projectId = activeLocalCloudProjectId;
      setWorkspaceSurfaceError(projectId ? null : CLOUD_PROJECT_RESOLVING_MESSAGE);
      if (!projectId) {
        const cloudRemote = getPuppyoneRemote(activeGitStatus);
        const configuredProjectId = puppyoneConfig?.cloud.projectId?.trim() || null;

        if (!activeCloudSession) {
          const message = "Sign in to Puppyone Cloud, then switch to the cloud project again.";
          setWorkspaceSurfaceError(message);
          showBrowserSignInStatus(message);
          void startCloudBrowserSignIn();
          return;
        }

        if (cloudRemote) {
          projectId = await withTimeout(
            (async () => {
              const projects = homeCloudProjects.length === 0
                ? await listCloudProjects(activeCloudSession, updateCloudSession, desktopCloudApiBaseUrl)
                : homeCloudProjects;
              if (homeCloudProjects.length === 0) setHomeCloudProjects(projects);
              return resolveWorkspaceCloudProjectId({
                activeGitStatus,
                apiBaseUrl: desktopCloudApiBaseUrl,
                configuredProjectId,
                onSessionChange: updateCloudSession,
                projects,
                session: activeCloudSession,
                workspace,
              });
            })(),
            CLOUD_PROJECT_SWITCH_RESOLVE_TIMEOUT_MS,
            CLOUD_PROJECT_MAPPING_ERROR,
          );
        }
      }

      if (projectId) {
        if (workspace && !workspaceIsCloud) {
          setRecentWorkspaceCloudBindings((current) => ({
            ...current,
            [workspace.id]: {
              projectId,
              cloudLinked: true,
              error: null,
            },
          }));

          if (puppyoneConfig?.cloud.projectId?.trim() !== projectId) {
            const nextConfig = mergePuppyoneWorkspaceConfig(puppyoneConfig, {
              cloud: {
                projectId,
              },
            });
            await handlePuppyoneConfigChange(nextConfig);
          }
        }
        setWorkspaceSurfaceError(null);
        setWorkspaceSurfaceDialogOpen(false);
        await openCloudProjectFromHomepage(projectId);
        return;
      }

      throw new Error(CLOUD_PROJECT_MAPPING_ERROR);
    })().catch((error) => {
      setHomeOperationStatus(null);
      setWorkspaceSurfaceError(error instanceof Error ? error.message : String(error));
    }).finally(() => {
      setWorkspaceSurfaceSwitching(false);
    });
  }, [
    activeCloudSession,
    activeGitStatus,
    activeLocalCloudProjectId,
    desktopCloudApiBaseUrl,
    handlePuppyoneConfigChange,
    homeCloudProjects,
    openCloudProjectFromHomepage,
    puppyoneConfig,
    setHomeCloudProjects,
    setHomeOperationStatus,
    setRecentWorkspaceCloudBindings,
    showBrowserSignInStatus,
    startCloudBrowserSignIn,
    updateCloudSession,
    workspace,
    workspaceIsCloud,
    workspaceSurfaceSwitching,
  ]);

  const switchToLocalWorkspaceSurface = useCallback(() => {
    const localPath = activeCloudLocalBinding?.workspace.path;
    if (!localPath) return;
    setWorkspaceSurfaceError(null);
    void openWorkspaceTarget({
      kind: "local",
      path: localPath,
    })
      .then(handleWorkspaceOpenResult)
      .catch((error) => {
        setWorkspaceSurfaceError(error instanceof Error ? error.message : String(error));
      });
  }, [activeCloudLocalBinding, handleWorkspaceOpenResult]);

  const openCloudWorkspaceLocally = useCallback(() => {
    if (!cloudProjectId) return;
    setWorkspaceSurfaceError(null);
    void (async () => {
      const result = await selectLocalWorkspaceFolder({ placement: "dedicated-window" });
      if (!result) return;

      const openedWorkspace = result.workspace;
      if (openedWorkspace) {
        try {
          const currentConfig = await readPuppyoneWorkspaceConfig(openedWorkspace.path).catch(() => null);
          const nextConfig = mergePuppyoneWorkspaceConfig(currentConfig, {
            cloud: {
              projectId: cloudProjectId,
            },
          });
          await writePuppyoneWorkspaceConfig(openedWorkspace.path, nextConfig);
          setRecentWorkspaceCloudBindings((current) => ({
            ...current,
            [openedWorkspace.id]: {
              projectId: cloudProjectId,
              cloudLinked: true,
              error: null,
            },
          }));
        } catch (error) {
          console.warn("Unable to bind local workspace to Cloud project:", error);
          setWorkspaceSurfaceError(error instanceof Error ? error.message : String(error));
        }
      }

      handleWorkspaceOpenResult(result);
      await refreshRecentWorkspaceList();
    })().catch((error) => {
      setWorkspaceSurfaceError(error instanceof Error ? error.message : String(error));
    });
  }, [
    cloudProjectId,
    handleWorkspaceOpenResult,
    refreshRecentWorkspaceList,
    setRecentWorkspaceCloudBindings,
  ]);

  const workspaceSurfaceAction = useMemo<DesktopWorkspaceSurfaceAction | null>(() => {
    if (!workspace) return null;
    if (!workspaceIsCloud && activeLocalCloudHostAvailable && cloudOnlyWorkspaceEnabled) {
      return {
        kind: "switch-to-cloud",
        disabled: workspaceSurfaceSwitching,
        onClick: switchToCloudProjectSurface,
      };
    }
    if (workspaceIsCloud && cloudProjectId) {
      if (activeCloudLocalBinding) {
        return {
          kind: "switch-to-local",
          onClick: switchToLocalWorkspaceSurface,
        };
      }
      return {
        kind: "open-locally",
        onClick: openCloudWorkspaceLocally,
      };
    }
    return null;
  }, [
    activeCloudLocalBinding,
    activeLocalCloudHostAvailable,
    cloudOnlyWorkspaceEnabled,
    cloudProjectId,
    openCloudWorkspaceLocally,
    switchToCloudProjectSurface,
    switchToLocalWorkspaceSurface,
    workspace,
    workspaceIsCloud,
    workspaceSurfaceSwitching,
  ]);

  return {
    setWorkspaceSurfaceDialogOpen,
    setWorkspaceSurfaceError,
    workspaceSurfaceAction,
    workspaceSurfaceDialogOpen,
    workspaceSurfaceError,
    workspaceSurfaceSwitching,
    workspaceSurfaceResolvePending: workspaceSurfaceError === CLOUD_PROJECT_RESOLVING_MESSAGE,
  };
}
