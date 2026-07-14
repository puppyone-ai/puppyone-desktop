import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { Workspace } from "@puppyone/shared-ui";
import { useLocalization } from "@puppyone/localization";
import type { RecentWorkspaceHomeItem, OnboardingOperationStatus } from "../../../components/MinimalOnboarding";
import {
  getCloudProject,
  revokeCloudWorkspaceBinding,
  revokeCloudWorkspaceBindingCredential,
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
import { formatCloudMessage } from "../cloudPresentation";

type WorkspaceSurfaceFeedback =
  | { kind: "resolving" }
  | { kind: "error"; message: string }
  | null;

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
  const { t } = useLocalization();
  const [workspaceSurfaceSwitching, setWorkspaceSurfaceSwitching] = useState(false);
  const [workspaceSurfaceFeedback, setWorkspaceSurfaceFeedback] = useState<WorkspaceSurfaceFeedback>(null);
  const [workspaceSurfaceDialogOpen, setWorkspaceSurfaceDialogOpen] = useState(false);
  const setWorkspaceSurfaceError = useCallback((message: string | null) => {
    setWorkspaceSurfaceFeedback(message ? { kind: "error", message } : null);
  }, []);
  const workspaceSurfaceError = workspaceSurfaceFeedback?.kind === "resolving"
    ? t("cloud.workspaceSurface.resolving")
    : workspaceSurfaceFeedback?.message ?? null;

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
  }, [setWorkspaceSurfaceError, workspace?.path]);

  // Local workspace Cloud project binding is owned by useCloudWorkspaceBinding.

  const switchToCloudProjectSurface = useCallback(() => {
    if (workspaceSurfaceSwitching) return;
    void (async () => {
      setWorkspaceSurfaceSwitching(true);
      setWorkspaceSurfaceDialogOpen(true);
      const projectId = activeLocalCloudProjectId;
      setWorkspaceSurfaceFeedback(projectId ? null : { kind: "resolving" });
      if (!projectId) {
        if (!activeCloudSession) {
          const message = t("cloud.workspaceSurface.signInToSwitch");
          setWorkspaceSurfaceError(message);
          showBrowserSignInStatus(message);
          void startCloudBrowserSignIn();
          return;
        }
        throw new Error(formatCloudMessage(CLOUD_PROJECT_UNRESOLVABLE_MESSAGE, t));
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
    setWorkspaceSurfaceError,
    showBrowserSignInStatus,
    startCloudBrowserSignIn,
    t,
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
  }, [activeCloudLocalBinding, handleWorkspaceOpenResult, setWorkspaceSurfaceError]);

  const openCloudWorkspaceLocally = useCallback(() => {
    if (!cloudProjectId) return;
    setWorkspaceSurfaceError(null);
    void (async () => {
      const result = await selectLocalWorkspaceFolder({ placement: "dedicated-window" });
      if (!result) return;

      const openedWorkspace = result.workspace;
      if (openedWorkspace) {
        let issuedBindingId: string | null = null;
        let bindingWasCreated = false;
        let currentConfig: PuppyoneWorkspaceConfig | null = null;
        let configUpdated = false;
        try {
          if (!activeCloudSession) {
            throw new Error(t("cloud.workspaceSurface.signInToAttach"));
          }
          const project = homeCloudProjects.find((entry) => entry.id === cloudProjectId)
            ?? await getCloudProject(
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
            onSessionChange: updateCloudSession,
          });
          issuedBindingId = attached.binding.id;
          bindingWasCreated = attached.bindingWasCreated;
          currentConfig = await readPuppyoneWorkspaceConfig(openedWorkspace.path);
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
          configUpdated = true;
          await configureWorkspaceCloudRemote(
            openedWorkspace.path,
            attached.remoteUrl,
            "puppyone",
            attached.credential,
            attached.username,
          );
          setRecentWorkspaceCloudBindings((current) => ({
            ...current,
            [openedWorkspace.id]: {
              projectId: cloudProjectId,
              bindingId: attached.binding.id,
              target: attached.binding.target,
              scopePath: attached.binding.scope_path ?? null,
              cloudLinked: true,
              error: null,
              reason: null,
            },
          }));
        } catch (error) {
          if (configUpdated && currentConfig) {
            await writePuppyoneWorkspaceConfig(
              openedWorkspace.path,
              currentConfig,
            ).catch(() => undefined);
          }
          if (issuedBindingId && activeCloudSession) {
            const compensate = bindingWasCreated
              ? revokeCloudWorkspaceBinding
              : revokeCloudWorkspaceBindingCredential;
            await compensate(
              activeCloudSession,
              issuedBindingId,
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
    setWorkspaceSurfaceError,
    t,
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
    workspaceSurfaceResolvePending: workspaceSurfaceFeedback?.kind === "resolving",
  };
}
