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
  type DesktopCloudProject,
  type DesktopCloudSession,
} from "../../../lib/cloudApi";
import {
  connectWorkspaceCloudProject,
} from "../../../lib/localFiles";
import {
  openWorkspaceTarget,
  selectLocalWorkspaceFolder,
} from "../../../lib/workspaceOpening";
import type { WorkspaceOpenResult } from "../../../types/electron";
import type { DesktopWorkspaceSurfaceAction } from "../../app-shell/navigation";
import {
  CLOUD_PROJECT_UNRESOLVABLE_MESSAGE,
  type RecentWorkspaceCloudContext,
} from "./cloudProjectResolution";
import { findRecentLocalWorkspaceForCloudProject } from "../../app-shell/workspaceHomeModel";
import { projectRootTarget } from "../repositoryTarget";
import { formatCloudMessage } from "../cloudPresentation";

type WorkspaceSurfaceFeedback =
  | { kind: "resolving" }
  | { kind: "error"; message: string }
  | null;

export function useWorkspaceSurfaceSwitch({
  activeCloudSession,
  cloudOnlyWorkspaceEnabled = false,
  cloudProjectId,
  desktopCloudApiBaseUrl,
  handleWorkspaceOpenResult,
  homeCloudProjects,
  openCloudProjectFromHomepage,
  recentWorkspaceCloudContexts,
  recentWorkspaceItems,
  refreshRecentWorkspaceList,
  setHomeOperationStatus,
  setRecentWorkspaceCloudContexts,
  showBrowserSignInStatus,
  startCloudBrowserSignIn,
  updateCloudSession,
  workspace,
  workspaceIsCloud,
}: {
  activeCloudSession: DesktopCloudSession | null;
  cloudOnlyWorkspaceEnabled?: boolean;
  cloudProjectId: string | null;
  desktopCloudApiBaseUrl: string | null;
  handleWorkspaceOpenResult: (result: WorkspaceOpenResult | null) => void;
  homeCloudProjects: DesktopCloudProject[];
  openCloudProjectFromHomepage: (projectId: string) => Promise<void>;
  recentWorkspaceCloudContexts: Record<string, RecentWorkspaceCloudContext>;
  recentWorkspaceItems: RecentWorkspaceHomeItem[];
  refreshRecentWorkspaceList: () => Promise<void>;
  setHomeOperationStatus: Dispatch<SetStateAction<OnboardingOperationStatus | null>>;
  setRecentWorkspaceCloudContexts: Dispatch<SetStateAction<Record<string, RecentWorkspaceCloudContext>>>;
  showBrowserSignInStatus: (detail: string) => void;
  startCloudBrowserSignIn: () => Promise<boolean>;
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
    const context = recentWorkspaceCloudContexts[workspace.id];
    return !context?.error ? context?.projectId?.trim() || null : null;
  }, [recentWorkspaceCloudContexts, workspace, workspaceIsCloud]);
  const activeLocalCloudHostAvailable = Boolean(activeLocalCloudProjectId);
  const activeCloudLocalWorkspace = useMemo(() => (
    findRecentLocalWorkspaceForCloudProject({
      contexts: recentWorkspaceCloudContexts,
      projectId: workspaceIsCloud ? cloudProjectId : null,
      recentWorkspaceItems,
    })
  ), [cloudProjectId, recentWorkspaceCloudContexts, recentWorkspaceItems, workspaceIsCloud]);

  useEffect(() => {
    setWorkspaceSurfaceSwitching(false);
    setWorkspaceSurfaceError(null);
    setWorkspaceSurfaceDialogOpen(false);
  }, [setWorkspaceSurfaceError, workspace?.path]);

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
    const localPath = activeCloudLocalWorkspace?.workspace.path;
    if (!localPath) return;
    setWorkspaceSurfaceError(null);
    void openWorkspaceTarget({ kind: "local", path: localPath })
      .then(handleWorkspaceOpenResult)
      .catch((error) => {
        setWorkspaceSurfaceError(error instanceof Error ? error.message : String(error));
      });
  }, [activeCloudLocalWorkspace, handleWorkspaceOpenResult, setWorkspaceSurfaceError]);

  const openCloudWorkspaceLocally = useCallback(() => {
    if (!cloudProjectId) return;
    setWorkspaceSurfaceError(null);
    void (async () => {
      const result = await selectLocalWorkspaceFolder({ placement: "dedicated-window" });
      if (!result) return;

      const openedWorkspace = result.workspace;
      if (openedWorkspace) {
        try {
          if (!activeCloudSession) {
            throw new Error(t("cloud.workspaceSurface.signInToConfigureRemote"));
          }
          const project = homeCloudProjects.find((entry) => entry.id === cloudProjectId)
            ?? await getCloudProject(
              activeCloudSession,
              cloudProjectId,
              updateCloudSession,
              desktopCloudApiBaseUrl,
            );
          const apiBaseUrl = desktopCloudApiBaseUrl ?? activeCloudSession.api_base_url;
          const connected = await connectWorkspaceCloudProject({
            rootPath: openedWorkspace.path,
            apiBaseUrl,
            userId: activeCloudSession.user_id,
            projectId: project.id,
          });
          if (!connected.ok) {
            throw new Error(connected.error.message || connected.error.code);
          }
          const configuredTarget = projectRootTarget(project.id);
          setRecentWorkspaceCloudContexts((current) => ({
            ...current,
            [openedWorkspace.id]: {
              projectId: cloudProjectId,
              target: configuredTarget,
              hasCloudRemote: true,
              error: null,
              reason: null,
            },
          }));
        } catch (error) {
          console.warn("Unable to configure the local PuppyOne Git remote:", error);
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
    setRecentWorkspaceCloudContexts,
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
      if (activeCloudLocalWorkspace) {
        return { kind: "switch-to-local", onClick: switchToLocalWorkspaceSurface };
      }
      return { kind: "open-locally", onClick: openCloudWorkspaceLocally };
    }
    return null;
  }, [
    activeCloudLocalWorkspace,
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
