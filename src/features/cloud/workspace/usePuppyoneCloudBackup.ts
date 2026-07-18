import { useCallback, useEffect, useRef, useState } from "react";
import type { Workspace } from "@puppyone/shared-ui";
import {
  abandonWorkspaceCloudPublish,
  getWorkspaceCloudPublishState,
  getWorkspaceGitStatus,
  startOrResumeWorkspaceCloudPublish,
  subscribeWorkspaceCloudPublishProgress,
} from "../../../lib/localFiles";
import { onDesktopCloudAuthError } from "../../../lib/cloudSession";
import type { DesktopCloudSession } from "../../../lib/cloudApi";
import type {
  CloudPublishErrorCode,
  CloudPublishProgress,
  CloudPublishResult,
  CloudPublishState,
  GitStatusSnapshot,
} from "../../../types/electron";
import type { DesktopView } from "../../../components/DesktopCloudShell";
import type { CloudWorkspaceSection } from "../types";
import { createRepositoryRefreshReason } from "../../source-control/repositoryRefreshPolicy";
import type { GitRefreshReason, GitRepositoryContext } from "../../source-control/gitRefreshScheduler";

export type CloudPublishFailure = {
  code: CloudPublishErrorCode;
  retryable: boolean;
};

export type CloudPublishNotice = "abandoned" | null;

export function usePuppyoneCloudBackup({
  activeCloudSession,
  applyGitStatus,
  captureGitRepositoryContext,
  clearGitSelection,
  cloudEnabled,
  desktopCloudApiBaseUrl,
  isGitRepositoryContextCurrent,
  refreshWorkspaceContent,
  setActiveCloudSection,
  setActiveView,
  setSidebarCollapsed,
  setSwitcherOpen,
  startCloudBrowserSignIn,
  workspace,
  workspaceIsCloud,
}: {
  activeCloudSession: DesktopCloudSession | null;
  applyGitStatus: (
    status: GitStatusSnapshot,
    context: GitRepositoryContext,
    reason?: GitRefreshReason,
  ) => boolean;
  captureGitRepositoryContext: (expectedRootPath?: string) => GitRepositoryContext | null;
  clearGitSelection: () => void;
  cloudEnabled: boolean;
  desktopCloudApiBaseUrl: string | null;
  isGitRepositoryContextCurrent: (context: GitRepositoryContext) => boolean;
  refreshWorkspaceContent: () => void;
  setActiveCloudSection: (section: CloudWorkspaceSection) => void;
  setActiveView: (view: DesktopView) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSwitcherOpen: (open: boolean) => void;
  startCloudBrowserSignIn: () => Promise<boolean>;
  workspace: Workspace | null;
  workspaceIsCloud: boolean;
}) {
  const [cloudPublishState, setCloudPublishState] = useState<CloudPublishState | null>(null);
  const [cloudPublishProgress, setCloudPublishProgress] = useState<CloudPublishProgress | null>(null);
  const [cloudPublishError, setCloudPublishError] = useState<CloudPublishFailure | null>(null);
  const [cloudPublishNotice, setCloudPublishNotice] = useState<CloudPublishNotice>(null);
  const [cloudPublishStateLoading, setCloudPublishStateLoading] = useState(false);
  const [cloudBackupLoading, setCloudBackupLoading] = useState(false);
  const [pendingCloudBackupSetup, setPendingCloudBackupSetup] = useState(false);
  const actionRef = useRef<symbol | null>(null);
  const stateRequestRef = useRef<symbol | null>(null);
  const pendingIntentWorkspaceRef = useRef<string | null>(null);

  const publishIdentity = getPublishIdentity({
    session: activeCloudSession,
    apiBaseUrl: desktopCloudApiBaseUrl,
    workspace,
    cloudEnabled,
    workspaceIsCloud,
  });
  const publishIdentityKey = publishIdentity
    ? [
        publishIdentity.rootPath,
        publishIdentity.apiBaseUrl,
        publishIdentity.userId,
        activeCloudSession?.session_generation ?? "",
      ].join("\n")
    : null;

  const reconcileGitStatus = useCallback((
    status: GitStatusSnapshot | undefined,
    context: GitRepositoryContext,
  ) => {
    if (!status || !isGitRepositoryContextCurrent(context)) return false;
    if (!applyGitStatus(
      status,
      context,
      createRepositoryRefreshReason("cloud-backup", "mutation"),
    )) return false;
    refreshWorkspaceContent();
    return true;
  }, [applyGitStatus, isGitRepositoryContextCurrent, refreshWorkspaceContent]);

  useEffect(() => {
    stateRequestRef.current = null;
    actionRef.current = null;
    setCloudPublishState(null);
    setCloudPublishProgress(null);
    setCloudPublishError(null);
    setCloudPublishNotice(null);
    setCloudBackupLoading(false);
    if (!publishIdentity || !publishIdentityKey) {
      if (!workspace || workspaceIsCloud || !cloudEnabled) {
        pendingIntentWorkspaceRef.current = null;
        setPendingCloudBackupSetup(false);
      }
      setCloudPublishStateLoading(false);
      return undefined;
    }

    if (pendingIntentWorkspaceRef.current !== publishIdentity.rootPath) {
      pendingIntentWorkspaceRef.current = null;
      setPendingCloudBackupSetup(false);
    }

    const request = Symbol("load-cloud-publish-state");
    stateRequestRef.current = request;
    setCloudPublishStateLoading(true);
    const context = captureGitRepositoryContext(publishIdentity.rootPath);
    void getWorkspaceCloudPublishState(publishIdentity)
      .then((result) => {
        if (stateRequestRef.current !== request) return;
        setCloudPublishState(result.state?.phase === "completed" ? null : result.state);
        if (!result.ok) {
          setCloudPublishError(toPublicFailure(result));
          return;
        }
        setCloudPublishError(null);
        if (context && result.gitStatus) reconcileGitStatus(result.gitStatus, context);
        if (result.state?.phase === "completed") {
          clearGitSelection();
          setActiveCloudSection("contents");
        }
      })
      .catch(() => {
        if (stateRequestRef.current === request) {
          setCloudPublishError({ code: "UNKNOWN", retryable: true });
        }
      })
      .finally(() => {
        if (stateRequestRef.current === request) {
          stateRequestRef.current = null;
          setCloudPublishStateLoading(false);
        }
      });

    return () => {
      if (stateRequestRef.current === request) stateRequestRef.current = null;
    };
  // The string is the complete authority boundary. Object identity must not restart recovery reads.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishIdentityKey]);

  useEffect(() => {
    const rootPath = publishIdentity?.rootPath;
    if (!rootPath) return undefined;
    return subscribeWorkspaceCloudPublishProgress((progress) => {
      if (progress.rootPath !== rootPath || !actionRef.current) return;
      setCloudPublishProgress(progress);
      if (progress.state) {
        setCloudPublishState(progress.state.phase === "completed" ? null : progress.state);
      }
    });
  // The normalized identity key owns this subscription's authority and lifetime.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishIdentityKey]);

  const finishSuccessfulPublish = useCallback((
    result: Extract<CloudPublishResult, { ok: true }>,
    context: GitRepositoryContext,
  ) => {
    if (result.gitStatus && !reconcileGitStatus(result.gitStatus, context)) return false;
    setCloudPublishState(result.state?.phase === "completed" ? null : result.state);
    setCloudPublishProgress(null);
    setCloudPublishError(null);
    setCloudPublishNotice(null);
    if (result.state?.phase !== "completed") return true;
    clearGitSelection();
    setActiveCloudSection("contents");
    setActiveView("cloud");
    setSidebarCollapsed(false);
    setSwitcherOpen(false);
    return true;
  }, [clearGitSelection, reconcileGitStatus, setActiveCloudSection, setActiveView, setSidebarCollapsed, setSwitcherOpen]);

  const runStartOrResume = useCallback(async (organizationId?: string) => {
    if (!cloudEnabled || !workspace || workspaceIsCloud || actionRef.current) return;
    if (!activeCloudSession) {
      pendingIntentWorkspaceRef.current = workspace.path;
      setPendingCloudBackupSetup(true);
      setCloudPublishError(null);
      setActiveView("cloud");
      setActiveCloudSection("initialize");
      setSidebarCollapsed(false);
      setSwitcherOpen(false);
      const started = await startCloudBrowserSignIn();
      if (!started) {
        pendingIntentWorkspaceRef.current = null;
        setPendingCloudBackupSetup(false);
        setCloudPublishError({ code: "SESSION_REQUIRED", retryable: true });
      }
      return;
    }

    const identity = getPublishIdentity({
      session: activeCloudSession,
      apiBaseUrl: desktopCloudApiBaseUrl,
      workspace,
      cloudEnabled,
      workspaceIsCloud,
    });
    const context = captureGitRepositoryContext(workspace.path);
    if (!identity || !context) {
      setCloudPublishError({ code: "REPOSITORY_REQUIRED", retryable: false });
      return;
    }
    const request = Symbol("start-or-resume-cloud-publish");
    stateRequestRef.current = null;
    setCloudPublishStateLoading(false);
    actionRef.current = request;
    setCloudBackupLoading(true);
    setCloudPublishProgress({
      rootPath: identity.rootPath,
      operationId: cloudPublishState?.operationId ?? null,
      stage: "validating",
      state: cloudPublishState,
      updatedAt: new Date().toISOString(),
    });
    setCloudPublishError(null);
    setCloudPublishNotice(null);
    try {
      const pending = cloudPublishState;
      const freshStatus = pending ? null : await getWorkspaceGitStatus(workspace.path);
      const selectedOrganizationId = pending?.organizationId ?? organizationId?.trim() ?? "";
      const expectedHeadCommitId = pending?.expectedHeadCommitId ?? freshStatus?.headCommitId ?? "";
      const expectedBranch = pending?.expectedBranch ?? normalizePublishBranch(freshStatus?.branch);
      if (!selectedOrganizationId) {
        setCloudPublishError({ code: "ORGANIZATION_REQUIRED", retryable: false });
        return;
      }
      const result = await startOrResumeWorkspaceCloudPublish({
        ...identity,
        organizationId: selectedOrganizationId,
        projectName: pending?.projectName ?? workspace.name,
        expectedHeadCommitId,
        expectedBranch,
      });
      if (actionRef.current !== request || !isGitRepositoryContextCurrent(context)) return;
      setCloudPublishState(result.state);
      if (!result.ok) {
        setCloudPublishError(toPublicFailure(result));
        return;
      }
      finishSuccessfulPublish(result, context);
    } catch {
      if (actionRef.current === request) {
        setCloudPublishError({ code: "UNKNOWN", retryable: true });
      }
    } finally {
      if (actionRef.current === request) {
        actionRef.current = null;
        setCloudBackupLoading(false);
        setCloudPublishProgress(null);
        pendingIntentWorkspaceRef.current = null;
        setPendingCloudBackupSetup(false);
      }
    }
  }, [
    activeCloudSession,
    captureGitRepositoryContext,
    cloudEnabled,
    cloudPublishState,
    desktopCloudApiBaseUrl,
    finishSuccessfulPublish,
    isGitRepositoryContextCurrent,
    setActiveCloudSection,
    setActiveView,
    setSidebarCollapsed,
    setSwitcherOpen,
    startCloudBrowserSignIn,
    workspace,
    workspaceIsCloud,
  ]);

  const handleAbandonPuppyoneBackup = useCallback(async () => {
    if (!publishIdentity || !cloudPublishState?.canAbandon || actionRef.current) return;
    const context = captureGitRepositoryContext(publishIdentity.rootPath);
    if (!context) return;
    const request = Symbol("abandon-cloud-publish");
    actionRef.current = request;
    setCloudBackupLoading(true);
    setCloudPublishProgress(null);
    setCloudPublishError(null);
    setCloudPublishNotice(null);
    try {
      const result = await abandonWorkspaceCloudPublish({
        ...publishIdentity,
        operationId: cloudPublishState.operationId,
      });
      if (actionRef.current !== request || !isGitRepositoryContextCurrent(context)) return;
      setCloudPublishState(result.state);
      if (!result.ok) {
        setCloudPublishError(toPublicFailure(result));
        return;
      }
      reconcileGitStatus(result.gitStatus, context);
      setCloudPublishState(null);
      setCloudPublishNotice("abandoned");
      setActiveCloudSection("initialize");
      setActiveView("cloud");
    } catch {
      if (actionRef.current === request) {
        setCloudPublishError({ code: "UNKNOWN", retryable: true });
      }
    } finally {
      if (actionRef.current === request) {
        actionRef.current = null;
        setCloudBackupLoading(false);
      }
    }
  }, [
    captureGitRepositoryContext,
    cloudPublishState,
    isGitRepositoryContextCurrent,
    publishIdentity,
    reconcileGitStatus,
    setActiveCloudSection,
    setActiveView,
  ]);

  useEffect(() => {
    if (!pendingCloudBackupSetup || activeCloudSession) return undefined;
    return onDesktopCloudAuthError(() => {
      pendingIntentWorkspaceRef.current = null;
      setPendingCloudBackupSetup(false);
      setCloudPublishError({ code: "SESSION_REQUIRED", retryable: true });
    });
  }, [activeCloudSession, pendingCloudBackupSetup]);

  return {
    cloudBackupLoading,
    cloudPublishError,
    cloudPublishNotice,
    cloudPublishProgress,
    cloudPublishState,
    cloudPublishStateLoading,
    handleAbandonPuppyoneBackup,
    handleStartPuppyoneBackup: runStartOrResume,
    pendingCloudBackupSetup,
  };
}

function getPublishIdentity({
  session,
  apiBaseUrl,
  workspace,
  cloudEnabled,
  workspaceIsCloud,
}: {
  session: DesktopCloudSession | null;
  apiBaseUrl: string | null;
  workspace: Workspace | null;
  cloudEnabled: boolean;
  workspaceIsCloud: boolean;
}) {
  if (!session || !workspace || !cloudEnabled || workspaceIsCloud) return null;
  const resolvedApiBaseUrl = (apiBaseUrl ?? session.api_base_url).trim().replace(/\/+$/, "");
  const userId = session.user_id.trim();
  if (!resolvedApiBaseUrl || !userId) return null;
  return { rootPath: workspace.path, apiBaseUrl: resolvedApiBaseUrl, userId };
}

function normalizePublishBranch(branch: string | null | undefined): string {
  const normalized = branch?.trim() ?? "";
  return normalized.toLowerCase() === "head" || normalized.toLowerCase() === "detached"
    ? ""
    : normalized;
}

function toPublicFailure(
  result: Extract<CloudPublishResult, { ok: false }>,
): CloudPublishFailure {
  return { code: result.error.code, retryable: result.error.retryable };
}
