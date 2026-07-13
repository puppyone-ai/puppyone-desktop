import { useCallback, useEffect, useState } from "react";
import type { Workspace } from "@puppyone/shared-ui";
import {
  commitWorkspaceGit,
  getWorkspaceGitStatus,
  initializeWorkspaceGitRepository,
  pushWorkspaceGit,
  stageAllWorkspaceGitChanges,
} from "../../../lib/localFiles";
import {
  createCloudProject,
  type DesktopCloudSession,
} from "../../../lib/cloudApi";
import type { DesktopView } from "../../../components/DesktopCloudShell";
import type { CloudWorkspaceSection } from "../types";
import type { GitStatusSnapshot } from "../../../types/electron";
import {
  createGitOperationErrorState,
  type GitOperationErrorState,
} from "../../source-control/operationDialogs";
import { createRepositoryRefreshReason } from "../../source-control/repositoryRefreshPolicy";
import type { GitRefreshReason, GitRepositoryContext } from "../../source-control/gitRefreshScheduler";
import { cloudMessage, type CloudMessageDescriptor } from "../cloudPresentation";

export function usePuppyoneCloudBackup({
  activeCloudSession,
  activeGitStatus,
  applyGitStatus,
  captureGitRepositoryContext,
  clearGitSelection,
  cloudEnabled,
  handleCloudSessionChange,
  onConfigureCloudRemote,
  isGitRepositoryContextCurrent,
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
  applyGitStatus: (
    status: GitStatusSnapshot,
    context: GitRepositoryContext,
    reason?: GitRefreshReason,
  ) => boolean;
  captureGitRepositoryContext: (expectedRootPath?: string) => GitRepositoryContext | null;
  clearGitSelection: () => void;
  cloudEnabled: boolean;
  handleCloudSessionChange: (session: DesktopCloudSession | null) => void;
  onConfigureCloudRemote: (projectId: string) => Promise<GitStatusSnapshot | null>;
  isGitRepositoryContextCurrent: (context: GitRepositoryContext) => boolean;
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
  const [cloudBackupError, setCloudBackupError] = useState<CloudMessageDescriptor | null>(null);

  const createPuppyoneCloudBackup = useCallback(async (session: DesktopCloudSession) => {
    if (!cloudEnabled) return false;
    if (!workspace) return false;
    if (workspaceIsCloud) return false;
    const context = captureGitRepositoryContext(workspace.path);
    if (!context) return false;

    setCloudBackupLoading(true);
    setCloudBackupError(null);
    setGitOperationLoading("cloud-backup");
    setGitOperationError(null);

    try {
      let nextStatus = activeGitStatus;
      if (!nextStatus) {
        nextStatus = await getWorkspaceGitStatus(context.rootPath);
      }

      if (!nextStatus.isRepo) {
        nextStatus = await initializeWorkspaceGitRepository(context.rootPath);
      }

      const localChangeCount =
        nextStatus.stagedEntries.length +
        nextStatus.unstagedEntries.length +
        nextStatus.untrackedEntries.length;

      if (localChangeCount > 0) {
        nextStatus = await stageAllWorkspaceGitChanges(context.rootPath);
        if (nextStatus.stagedEntries.length > 0) {
          nextStatus = await commitWorkspaceGit(context.rootPath, "");
        }
      }

      const project = await createCloudProject(session, workspace.name, handleCloudSessionChange);
      nextStatus = await onConfigureCloudRemote(project.id)
        ?? await getWorkspaceGitStatus(context.rootPath);

      if (nextStatus.headCommitId) {
        nextStatus = await pushWorkspaceGit(context.rootPath);
      }

      if (!applyGitStatus(
        nextStatus,
        context,
        createRepositoryRefreshReason("cloud-backup", "mutation"),
      )) return false;
      refreshWorkspaceContent();
      setPendingCloudBackupSetup(false);
      clearGitSelection();
      setActiveCloudSection("contents");
      setActiveView("cloud");
      setSidebarCollapsed(false);
      setSwitcherOpen(false);
      return true;
    } catch (error) {
      if (!isGitRepositoryContextCurrent(context)) return false;
      const message = error instanceof Error ? error.message : String(error);
      setCloudBackupError(cloudMessage("backup-create-failed", undefined, message || undefined));
      setGitOperationError(createGitOperationErrorState(error, "cloud-backup", context.rootPath));
      setPendingCloudBackupSetup(false);
      setActiveView("cloud");
      return false;
    } finally {
      if (isGitRepositoryContextCurrent(context)) {
        setCloudBackupLoading(false);
        setGitOperationLoading(null);
      }
    }
  }, [
    activeGitStatus,
    applyGitStatus,
    captureGitRepositoryContext,
    clearGitSelection,
    cloudEnabled,
    handleCloudSessionChange,
    onConfigureCloudRemote,
    isGitRepositoryContextCurrent,
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
