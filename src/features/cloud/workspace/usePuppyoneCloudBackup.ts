import { useCallback, useEffect, useState } from "react";
import type { Workspace } from "@puppyone/shared-ui";
import {
  commitWorkspaceGit,
  configureWorkspaceCloudRemote,
  getWorkspaceGitStatus,
  initializeWorkspaceGitRepository,
  pushWorkspaceGit,
  stageAllWorkspaceGitChanges,
} from "../../../lib/localFiles";
import {
  createCloudProject,
  getCloudRepoIdentity,
  type DesktopCloudSession,
} from "../../../lib/cloudApi";
import type { DesktopView } from "../../../components/DesktopCloudShell";
import type { CloudWorkspaceSection } from "../types";
import type { GitStatusSnapshot, PuppyoneWorkspaceConfig } from "../../../types/electron";
import {
  mergePuppyoneWorkspaceConfig,
} from "../../app-shell/preferences";
import {
  createGitOperationErrorState,
  type GitOperationErrorState,
} from "../../source-control/operationDialogs";

export function usePuppyoneCloudBackup({
  activeCloudSession,
  activeGitStatus,
  applyGitStatus,
  clearGitSelection,
  cloudEnabled,
  handleCloudSessionChange,
  handlePuppyoneConfigChange,
  puppyoneConfig,
  refreshWorkspaceContent,
  setActiveCloudSection,
  setActiveView,
  setGitOperationError,
  setGitOperationLoading,
  setSidebarCollapsed,
  setSwitcherOpen,
  workspace,
  workspaceIsCloud,
}: {
  activeCloudSession: DesktopCloudSession | null;
  activeGitStatus: GitStatusSnapshot | null;
  applyGitStatus: (status: GitStatusSnapshot, rootPath: string) => void;
  clearGitSelection: () => void;
  cloudEnabled: boolean;
  handleCloudSessionChange: (session: DesktopCloudSession | null) => void;
  handlePuppyoneConfigChange: (nextConfig: PuppyoneWorkspaceConfig) => Promise<PuppyoneWorkspaceConfig | null>;
  puppyoneConfig: PuppyoneWorkspaceConfig | null;
  refreshWorkspaceContent: () => void;
  setActiveCloudSection: (section: CloudWorkspaceSection) => void;
  setActiveView: (view: DesktopView) => void;
  setGitOperationError: (error: GitOperationErrorState | null) => void;
  setGitOperationLoading: (loading: string | null) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSwitcherOpen: (open: boolean) => void;
  workspace: Workspace | null;
  workspaceIsCloud: boolean;
}) {
  const [pendingCloudBackupSetup, setPendingCloudBackupSetup] = useState(false);
  const [cloudBackupLoading, setCloudBackupLoading] = useState(false);
  const [cloudBackupError, setCloudBackupError] = useState<string | null>(null);

  const createPuppyoneCloudBackup = useCallback(async (session: DesktopCloudSession) => {
    if (!cloudEnabled) return false;
    if (!workspace) return false;
    if (workspaceIsCloud) return false;

    setCloudBackupLoading(true);
    setCloudBackupError(null);
    setGitOperationLoading("cloud-backup");
    setGitOperationError(null);

    try {
      let nextStatus = activeGitStatus;
      if (!nextStatus) {
        nextStatus = await getWorkspaceGitStatus(workspace.path);
      }

      if (!nextStatus.isRepo) {
        nextStatus = await initializeWorkspaceGitRepository(workspace.path);
      }

      const localChangeCount =
        nextStatus.stagedEntries.length +
        nextStatus.unstagedEntries.length +
        nextStatus.untrackedEntries.length;

      if (localChangeCount > 0) {
        nextStatus = await stageAllWorkspaceGitChanges(workspace.path);
        if (nextStatus.stagedEntries.length > 0) {
          nextStatus = await commitWorkspaceGit(workspace.path, "");
        }
      }

      const project = await createCloudProject(session, workspace.name, handleCloudSessionChange);
      const identity = await getCloudRepoIdentity(session, project.id, handleCloudSessionChange);
      await configureWorkspaceCloudRemote(workspace.path, identity.url, "puppyone");
      const nextConfig = mergePuppyoneWorkspaceConfig(puppyoneConfig, {
        sync: {
          sourceOfTruth: {
            service: "puppyone",
            remote: "puppyone",
            branch: null,
          },
        },
        backup: {
          enabled: true,
          service: "puppyone",
          remote: "puppyone",
          branch: null,
        },
        git: {
          primaryRemote: "puppyone",
          watchedBranch: null,
        },
        cloud: {
          projectId: project.id,
        },
      });
      await handlePuppyoneConfigChange(nextConfig);
      nextStatus = await getWorkspaceGitStatus(workspace.path);

      if (nextStatus.headCommitId) {
        nextStatus = await pushWorkspaceGit(workspace.path);
      }

      applyGitStatus(nextStatus, workspace.path);
      refreshWorkspaceContent();
      setPendingCloudBackupSetup(false);
      clearGitSelection();
      setActiveCloudSection("overview");
      setActiveView("cloud");
      setSidebarCollapsed(false);
      setSwitcherOpen(false);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCloudBackupError(message || "Unable to create PuppyOne Cloud backup.");
      setGitOperationError(createGitOperationErrorState(error, "cloud-backup", workspace.path));
      setPendingCloudBackupSetup(false);
      setActiveView("cloud");
      return false;
    } finally {
      setCloudBackupLoading(false);
      setGitOperationLoading(null);
    }
  }, [
    activeGitStatus,
    applyGitStatus,
    clearGitSelection,
    cloudEnabled,
    handleCloudSessionChange,
    handlePuppyoneConfigChange,
    puppyoneConfig,
    refreshWorkspaceContent,
    setActiveCloudSection,
    setActiveView,
    setGitOperationError,
    setGitOperationLoading,
    setSidebarCollapsed,
    setSwitcherOpen,
    workspace,
    workspaceIsCloud,
  ]);

  const handleStartPuppyoneBackup = useCallback(() => {
    if (!cloudEnabled) return;
    if (workspaceIsCloud) return;

    setPendingCloudBackupSetup(true);
    setCloudBackupError(null);
    setGitOperationError(null);

    if (!activeCloudSession) {
      setActiveView("cloud");
      setActiveCloudSection("overview");
      setSidebarCollapsed(false);
      setSwitcherOpen(false);
    }
  }, [
    activeCloudSession,
    cloudEnabled,
    setActiveCloudSection,
    setActiveView,
    setGitOperationError,
    setSidebarCollapsed,
    setSwitcherOpen,
    workspaceIsCloud,
  ]);

  useEffect(() => {
    if (!cloudEnabled) return;
    if (!pendingCloudBackupSetup || !activeCloudSession || cloudBackupLoading) return;
    void createPuppyoneCloudBackup(activeCloudSession);
  }, [
    activeCloudSession,
    cloudBackupLoading,
    cloudEnabled,
    createPuppyoneCloudBackup,
    pendingCloudBackupSetup,
  ]);

  useEffect(() => {
    setPendingCloudBackupSetup(false);
    setCloudBackupLoading(false);
    setCloudBackupError(null);
  }, [workspace?.path]);

  return {
    cloudBackupError,
    cloudBackupLoading,
    handleStartPuppyoneBackup,
    pendingCloudBackupSetup,
  };
}
