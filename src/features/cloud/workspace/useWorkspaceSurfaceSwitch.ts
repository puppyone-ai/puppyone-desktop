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
  getCloudProject,
  getCloudRepoIdentity,
  revokeCloudWorkspaceBinding,
  type DesktopCloudProject,
  type DesktopCloudSession,
} from "../../../lib/cloudApi";
import {
  configureWorkspaceCloudRemote,
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
  CLOUD_PROJECT_UNRESOLVABLE_MESSAGE,
  type RecentWorkspaceCloudBinding,
} from "./cloudProjectResolution";
import { findRecentLocalWorkspaceBindingForCloudProject } from "../../app-shell/workspaceHomeModel";
import { cloudOriginFromApiBase, createExplicitWorkspaceBinding } from "./explicitWorkspaceBinding";

const CLOUD_PROJECT_RESOLVING_MESSAGE = "Resolving Cloud project...";

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
  setHomeCloudProjects: _setHomeCloudProjects,
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
    const binding = recentWorkspaceCloudBindings[workspace.id];
    return binding?.bindingId && !binding.error
      ? binding.projectId?.trim() || null
      : null;
  }, [
    recentWorkspaceCloudBindings,
    workspace,
    workspaceIsCloud,
  ]);
  const activeLocalCloudLinked = useMemo(() => (
    Boolean(activeLocalCloudProjectId)
  ), [activeLocalCloudProjectId]);
  const activeLocalCloudHostAvailable = useMemo(() => {
    if (!workspace || workspaceIsCloud) return false;
    return activeLocalCloudLinked;
  }, [
    activeLocalCloudLinked,
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

  // Local workspace Cloud project binding is owned by useCloudWorkspaceBinding.

  const switchToCloudProjectSurface = useCallback(() => {
    if (workspaceSurfaceSwitching) return;
    void (async () => {
      setWorkspaceSurfaceSwitching(true);
      setWorkspaceSurfaceDialogOpen(true);
      const projectId = activeLocalCloudProjectId;
      setWorkspaceSurfaceError(projectId ? null : CLOUD_PROJECT_RESOLVING_MESSAGE);
      if (!projectId) {
        if (!activeCloudSession) {
          const message = "Sign in to Puppyone Cloud, then switch to the cloud project again.";
          setWorkspaceSurfaceError(message);
          showBrowserSignInStatus(message);
          void startCloudBrowserSignIn();
          return;
        }
        throw new Error(CLOUD_PROJECT_UNRESOLVABLE_MESSAGE);
      }

      setWorkspaceSurfaceError(null);
      setWorkspaceSurfaceDialogOpen(false);
      await openCloudProjectFromHomepage(projectId);
    })().catch((error) => {
      setHomeOperationStatus(null);
      setWorkspaceSurfaceError(error instanceof Error ? error.message : String(error));
    }).finally(() => {
      setWorkspaceSurfaceSwitching(false);
    });
  }, [
    activeCloudSession,
    activeLocalCloudProjectId,
    openCloudProjectFromHomepage,
    setHomeOperationStatus,
    showBrowserSignInStatus,
    startCloudBrowserSignIn,
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
        let createdBindingId: string | null = null;
        try {
          if (!activeCloudSession) {
            throw new Error("Sign in before attaching a Cloud project locally.");
          }
          const project = homeCloudProjects.find((entry) => entry.id === cloudProjectId)
            ?? await getCloudProject(
              activeCloudSession,
              cloudProjectId,
              updateCloudSession,
              desktopCloudApiBaseUrl,
            );
          const identity = await getCloudRepoIdentity(
            activeCloudSession,
            cloudProjectId,
            updateCloudSession,
            desktopCloudApiBaseUrl,
          );
          const attached = await createExplicitWorkspaceBinding({
            session: activeCloudSession,
            apiBaseUrl: desktopCloudApiBaseUrl,
            project,
            projectId: cloudProjectId,
            workspace: openedWorkspace,
            remoteUrl: identity.url,
            onSessionChange: updateCloudSession,
          });
          createdBindingId = attached.binding.id;
          await configureWorkspaceCloudRemote(
            openedWorkspace.path, attached.credentialRemoteUrl, "puppyone",
          );
          const currentConfig = await readPuppyoneWorkspaceConfig(openedWorkspace.path).catch(() => null);
          const nextConfig = mergePuppyoneWorkspaceConfig(currentConfig, {
            project: {
              workspaceInstanceId: openedWorkspace.workspaceInstanceId ?? null,
            },
            cloud: {
              projectId: cloudProjectId,
              origin: cloudOriginFromApiBase(desktopCloudApiBaseUrl ?? activeCloudSession.api_base_url),
              bindingId: attached.binding.id,
            },
          });
          await writePuppyoneWorkspaceConfig(openedWorkspace.path, nextConfig);
          setRecentWorkspaceCloudBindings((current) => ({
            ...current,
            [openedWorkspace.id]: {
              projectId: cloudProjectId,
              bindingId: attached.binding.id,
              bindingKind: attached.binding.binding_kind,
              scopePath: attached.binding.scope_path ?? null,
              cloudLinked: true,
              error: null,
              reason: null,
            },
          }));
        } catch (error) {
          if (createdBindingId && activeCloudSession) {
            await revokeCloudWorkspaceBinding(
              activeCloudSession,
              createdBindingId,
              updateCloudSession,
              desktopCloudApiBaseUrl,
            ).catch(() => undefined);
          }
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
    activeCloudSession,
    cloudProjectId,
    desktopCloudApiBaseUrl,
    handleWorkspaceOpenResult,
    homeCloudProjects,
    refreshRecentWorkspaceList,
    setRecentWorkspaceCloudBindings,
    updateCloudSession,
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
