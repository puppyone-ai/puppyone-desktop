import { useCallback, useEffect, useRef, useState } from "react";
import type { Workspace } from "@puppyone/shared-ui";
import {
  getWorkspaceGitStatus,
  pushWorkspaceGitCommitToRemote,
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
import {
  getCloudPublishReadiness,
  matchesCloudPublishExpectedIdentity,
} from "./cloudPublishReadiness";

export type CloudBackupContinuationPhase = "project-created" | "remote-configured" | "pushed";

export type CloudBackupContinuation = {
  projectId: string;
  phase: CloudBackupContinuationPhase;
  remoteConfigured: boolean;
  expectedHeadCommitId: string;
  expectedBranch: string;
};

type ConfigureCloudRemoteForPublishOptions = {
  persistWorkspacePreferences: false;
  requireWrite: true;
  deferStatusPublication: true;
  rejectRemoteNameCollision: true;
  expectedHeadCommitId: string;
  expectedBranch: string;
};

const CLOUD_REMOTE_NAME = "puppyone";
const CLOUD_DESTINATION_BRANCH = "main";

export function usePuppyoneCloudBackup({
  activeCloudSession,
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
  onConfigureCloudRemote: (
    projectId: string,
    options: ConfigureCloudRemoteForPublishOptions,
  ) => Promise<GitStatusSnapshot | null>;
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
  const [cloudBackupContinuation, setCloudBackupContinuation] = useState<CloudBackupContinuation | null>(null);
  const publishAttemptRef = useRef<symbol | null>(null);
  const publishRequestRef = useRef<symbol | null>(null);
  const cloudBackupContinuationRef = useRef<CloudBackupContinuation | null>(null);

  const saveCloudBackupContinuation = useCallback((continuation: CloudBackupContinuation | null) => {
    cloudBackupContinuationRef.current = continuation;
    setCloudBackupContinuation(continuation);
  }, []);

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
      let continuation = cloudBackupContinuationRef.current;

      if (!continuation) {
        // Never trust the renderer's cached status for a publish preflight. This
        // snapshot is intentionally taken immediately before the first server
        // mutation so a stale HEAD, detached checkout, or remote collision
        // cannot create an orphan Cloud project.
        const preflightStatus = await getWorkspaceGitStatus(context.rootPath);
        const preflightError = validatePublishStatus(preflightStatus);
        if (preflightError) {
          failPublishAttempt(attempt, preflightError);
          return false;
        }
        if (preflightStatus.remotes.some(
          (remote) => remote.name.toLowerCase() === CLOUD_REMOTE_NAME,
        )) {
          failPublishAttempt(
            attempt,
            cloudMessage(
              "project-publish-failed",
              undefined,
              "A Git remote named 'puppyone' already exists. Rename or remove it before initializing this project on PuppyOne Cloud.",
            ),
          );
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
        continuation = {
          projectId: project.id,
          phase: "project-created",
          remoteConfigured: false,
          expectedHeadCommitId: preflightStatus.headCommitId!,
          expectedBranch: preflightStatus.branch!,
        };
        // Persist the continuation as soon as the Project id exists. Any later
        // failure resumes this exact Project rather than creating a duplicate.
        saveCloudBackupContinuation(continuation);
      }

      if (continuation.phase === "project-created") {
        const statusBeforeRemote = await getWorkspaceGitStatus(context.rootPath);
        const identityError = validateExpectedPublishStatus(statusBeforeRemote, continuation);
        if (identityError) {
          failPublishAttempt(attempt, identityError);
          return false;
        }
        if (
          publishAttemptRef.current !== attempt
          || !isGitRepositoryContextCurrent(context)
        ) {
          failPublishAttempt(attempt, cloudMessage("project-publish-failed"));
          return false;
        }

        await onConfigureCloudRemote(continuation.projectId, {
          persistWorkspacePreferences: false,
          requireWrite: true,
          deferStatusPublication: true,
          rejectRemoteNameCollision: true,
          expectedHeadCommitId: continuation.expectedHeadCommitId,
          expectedBranch: continuation.expectedBranch,
        });
        continuation = {
          ...continuation,
          phase: "remote-configured",
          remoteConfigured: true,
        };
        saveCloudBackupContinuation(continuation);
      }

      let nextStatus: GitStatusSnapshot;
      if (continuation.phase === "remote-configured") {
        // Re-read immediately before the network push. The main process also
        // verifies this identity under the repository mutation lock, and the
        // refspec names the immutable expected commit rather than HEAD.
        const statusBeforePush = await getWorkspaceGitStatus(context.rootPath);
        const identityError = validateExpectedPublishStatus(statusBeforePush, continuation);
        if (identityError) {
          failPublishAttempt(attempt, identityError);
          return false;
        }
        if (
          publishAttemptRef.current !== attempt
          || !isGitRepositoryContextCurrent(context)
        ) {
          failPublishAttempt(attempt, cloudMessage("project-publish-failed"));
          return false;
        }

        nextStatus = await pushWorkspaceGitCommitToRemote(context.rootPath, {
          remoteName: CLOUD_REMOTE_NAME,
          destinationBranch: CLOUD_DESTINATION_BRANCH,
          expectedHeadCommitId: continuation.expectedHeadCommitId,
          expectedBranch: continuation.expectedBranch,
        });
        continuation = {
          ...continuation,
          phase: "pushed",
          remoteConfigured: true,
        };
        saveCloudBackupContinuation(continuation);

        const pushedIdentityError = validateExpectedPublishStatus(nextStatus, continuation);
        if (pushedIdentityError) {
          failPublishAttempt(attempt, pushedIdentityError);
          return false;
        }
      } else {
        // A previous attempt completed the server push but failed while
        // publishing renderer state. Retry only the local reconciliation.
        nextStatus = await getWorkspaceGitStatus(context.rootPath);
        const identityError = validateExpectedPublishStatus(nextStatus, continuation);
        if (identityError) {
          failPublishAttempt(attempt, identityError);
          return false;
        }
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
      saveCloudBackupContinuation(null);
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
    saveCloudBackupContinuation,
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
      setActiveCloudSection("initialize");
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
    cloudBackupContinuationRef.current = null;
    setPendingCloudBackupSetup(false);
    setCloudBackupLoading(false);
    setCloudBackupError(null);
    setCloudBackupContinuation(null);
  }, [workspace?.path]);

  return {
    cloudBackupCanRetry: cloudBackupContinuation !== null && !cloudBackupLoading,
    cloudBackupContinuation,
    cloudBackupError,
    cloudBackupLoading,
    handleStartPuppyoneBackup,
    pendingCloudBackupSetup,
  };
}

function validatePublishStatus(status: GitStatusSnapshot): CloudMessageDescriptor | null {
  const readiness = getCloudPublishReadiness(status);
  if (readiness === "repository-required" || readiness === "commit-required") {
    return cloudMessage("project-publish-commit-required");
  }
  if (readiness === "branch-required") {
    return cloudMessage("project-publish-branch-required");
  }
  return null;
}

function validateExpectedPublishStatus(
  status: GitStatusSnapshot,
  continuation: CloudBackupContinuation,
): CloudMessageDescriptor | null {
  const basicError = validatePublishStatus(status);
  if (basicError) return basicError;
  if (!matchesCloudPublishExpectedIdentity(status, {
    headCommitId: continuation.expectedHeadCommitId,
    branch: continuation.expectedBranch,
  })) {
    return cloudMessage(
      "project-publish-failed",
      undefined,
      "The current branch or HEAD changed while this project was being initialized. Restore the original branch and commit, then retry.",
    );
  }
  return null;
}
