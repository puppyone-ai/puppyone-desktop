import { useCallback, useEffect, useRef, useState } from "react";
import type { Workspace } from "@puppyone/shared-ui";
import {
  getWorkspaceGitStatus,
  pushWorkspaceGit,
} from "../../../lib/localFiles";
import {
  createCloudProject,
  type DesktopCloudSession,
} from "../../../lib/cloudApi";
import { onDesktopCloudAuthError } from "../../../lib/cloudSession";
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
  startCloudBrowserSignIn,
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
  startCloudBrowserSignIn: () => Promise<boolean>;
  workspace: Workspace | null;
  workspaceIsCloud: boolean;
}) {
  const [pendingCloudBackupSetup, setPendingCloudBackupSetup] = useState(false);
  const [cloudBackupLoading, setCloudBackupLoading] = useState(false);
  const [cloudBackupError, setCloudBackupError] = useState<CloudMessageDescriptor | null>(null);
  const publishAttemptRef = useRef<symbol | null>(null);
  const publishRequestRef = useRef<symbol | null>(null);

  const failPublishAttempt = useCallback((
    attempt: symbol,
    error: CloudMessageDescriptor,
  ) => {
    if (publishAttemptRef.current !== attempt) return;
    publishAttemptRef.current = null;
    setPendingCloudBackupSetup(false);
    setCloudBackupError(error);
  }, []);

  const createPuppyoneCloudBackup = useCallback(async (
    session: DesktopCloudSession,
    attempt: symbol,
  ) => {
    if (publishAttemptRef.current !== attempt || publishRequestRef.current) return false;
    if (!cloudEnabled || !workspace || workspaceIsCloud) {
      failPublishAttempt(attempt, cloudMessage("project-publish-failed"));
      return false;
    }
    const context = captureGitRepositoryContext(workspace.path);
    if (!context) {
      failPublishAttempt(attempt, cloudMessage("project-publish-failed"));
      return false;
    }

    publishRequestRef.current = attempt;
    setCloudBackupLoading(true);
    setCloudBackupError(null);
    setGitOperationLoading("cloud-backup");
    setGitOperationError(null);

    try {
      let nextStatus = activeGitStatus;
      if (!nextStatus) {
        nextStatus = await getWorkspaceGitStatus(context.rootPath);
      }

      if (!nextStatus.isRepo || !nextStatus.headCommitId) {
        failPublishAttempt(attempt, cloudMessage("project-publish-commit-required"));
        return false;
      }
      if (!nextStatus.branch || nextStatus.branch === "HEAD") {
        failPublishAttempt(attempt, cloudMessage("project-publish-branch-required"));
        return false;
      }

      if (
        publishAttemptRef.current !== attempt
        || !isGitRepositoryContextCurrent(context)
      ) {
        failPublishAttempt(attempt, cloudMessage("project-publish-failed"));
        return false;
      }

      const project = await createCloudProject(session, workspace.name, handleCloudSessionChange);
      nextStatus = await onConfigureCloudRemote(project.id)
        ?? await getWorkspaceGitStatus(context.rootPath);

      if (nextStatus.headCommitId) {
        nextStatus = await pushWorkspaceGit(context.rootPath);
      }

      if (
        publishAttemptRef.current !== attempt
        || !isGitRepositoryContextCurrent(context)
        || !applyGitStatus(
          nextStatus,
          context,
          createRepositoryRefreshReason("cloud-backup", "mutation"),
        )
      ) {
        failPublishAttempt(attempt, cloudMessage("project-publish-failed"));
        return false;
      }
      refreshWorkspaceContent();
      publishAttemptRef.current = null;
      setPendingCloudBackupSetup(false);
      clearGitSelection();
      setActiveCloudSection("contents");
      setActiveView("cloud");
      setSidebarCollapsed(false);
      setSwitcherOpen(false);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failPublishAttempt(
        attempt,
        cloudMessage("project-publish-failed", undefined, message || undefined),
      );
      if (isGitRepositoryContextCurrent(context)) {
        setGitOperationError(createGitOperationErrorState(error, "cloud-backup", context.rootPath));
        setActiveView("cloud");
      }
      return false;
    } finally {
      if (publishRequestRef.current === attempt) {
        publishRequestRef.current = null;
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
    failPublishAttempt,
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
    if (!workspace) return;
    if (workspaceIsCloud) return;
    if (publishAttemptRef.current || publishRequestRef.current) return;

    const attempt = Symbol("publish-project");
    publishAttemptRef.current = attempt;
    setPendingCloudBackupSetup(true);
    setCloudBackupError(null);
    setGitOperationError(null);

    if (!activeCloudSession) {
      setActiveView("cloud");
      setActiveCloudSection("overview");
      setSidebarCollapsed(false);
      setSwitcherOpen(false);
      void startCloudBrowserSignIn().then((started) => {
        if (started || publishAttemptRef.current !== attempt) return;
        failPublishAttempt(attempt, cloudMessage("auth-start-failed"));
      });
    }
  }, [
    activeCloudSession,
    cloudEnabled,
    failPublishAttempt,
    setActiveCloudSection,
    setActiveView,
    setGitOperationError,
    setSidebarCollapsed,
    setSwitcherOpen,
    startCloudBrowserSignIn,
    workspace,
    workspaceIsCloud,
  ]);

  useEffect(() => {
    if (!pendingCloudBackupSetup || cloudBackupLoading) return undefined;
    return onDesktopCloudAuthError((message) => {
      const attempt = publishAttemptRef.current;
      if (!attempt) return;
      failPublishAttempt(
        attempt,
        cloudMessage("auth-start-failed", undefined, message),
      );
    });
  }, [cloudBackupLoading, failPublishAttempt, pendingCloudBackupSetup]);

  useEffect(() => {
    if (!cloudEnabled) return;
    if (!pendingCloudBackupSetup || !activeCloudSession || cloudBackupLoading) return;
    const attempt = publishAttemptRef.current;
    if (!attempt) return;
    void createPuppyoneCloudBackup(activeCloudSession, attempt);
  }, [
    activeCloudSession,
    cloudBackupLoading,
    cloudEnabled,
    createPuppyoneCloudBackup,
    pendingCloudBackupSetup,
  ]);

  useEffect(() => {
    publishAttemptRef.current = null;
    publishRequestRef.current = null;
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
