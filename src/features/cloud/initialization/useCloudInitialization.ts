import { useCallback, useEffect, useRef, useState } from "react";
import type { Workspace } from "@puppyone/shared-ui";
import {
  cleanupWorkspaceCloudInitialization,
  getWorkspaceCloudInitializationState,
  getWorkspaceGitStatus,
  startWorkspaceCloudInitialization,
  subscribeWorkspaceCloudInitializationProgress,
} from "../../../lib/localFiles";
import { onDesktopCloudAuthError } from "../../../lib/cloudSession";
import type { DesktopCloudSession } from "../../../lib/cloudApi";
import type {
  CloudInitializationAction,
  CloudInitializationErrorCode,
  CloudInitializationProgress,
  CloudInitializationResult,
  CloudInitializationState,
  GitStatusSnapshot,
} from "../../../types/electron";
import type { DesktopView } from "../../../components/DesktopCloudShell";
import type { CloudWorkspaceSection } from "../types";
import { createRepositoryRefreshReason } from "../../source-control/repositoryRefreshPolicy";
import type { GitRefreshReason, GitRepositoryContext } from "../../source-control/gitRefreshScheduler";

export type CloudInitializationFailure = {
  code: CloudInitializationErrorCode;
  retryable: boolean;
};

export type CloudInitializationNotice = "cleanup-completed" | null;

export function useCloudInitialization({
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
  const [state, setState] = useState<CloudInitializationState | null>(null);
  const [progress, setProgress] = useState<CloudInitializationProgress | null>(null);
  const [error, setError] = useState<CloudInitializationFailure | null>(null);
  const [notice, setNotice] = useState<CloudInitializationNotice>(null);
  const [stateLoading, setStateLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [pendingSignIn, setPendingSignIn] = useState(false);
  const actionRef = useRef<symbol | null>(null);
  const stateRequestRef = useRef<symbol | null>(null);
  const pendingIntentWorkspaceRef = useRef<string | null>(null);

  const identity = getInitializationIdentity({
    session: activeCloudSession,
    apiBaseUrl: desktopCloudApiBaseUrl,
    workspace,
    cloudEnabled,
    workspaceIsCloud,
  });
  const identityKey = identity
    ? [
        identity.rootPath,
        identity.apiBaseUrl,
        identity.userId,
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
      createRepositoryRefreshReason("cloud-initialization", "mutation"),
    )) return false;
    refreshWorkspaceContent();
    return true;
  }, [applyGitStatus, isGitRepositoryContextCurrent, refreshWorkspaceContent]);

  const finishPublished = useCallback((
    result: Extract<CloudInitializationResult, { ok: true }>,
    context: GitRepositoryContext,
  ) => {
    if (result.gitStatus && !reconcileGitStatus(result.gitStatus, context)) return false;
    const published = isPublished(result.state);
    setState(published ? null : result.state);
    setProgress(null);
    setError(null);
    setNotice(null);
    if (!published) return true;
    clearGitSelection();
    setActiveCloudSection("contents");
    setActiveView("cloud");
    setSidebarCollapsed(false);
    setSwitcherOpen(false);
    return true;
  }, [clearGitSelection, reconcileGitStatus, setActiveCloudSection, setActiveView, setSidebarCollapsed, setSwitcherOpen]);

  useEffect(() => {
    stateRequestRef.current = null;
    actionRef.current = null;
    setState(null);
    setProgress(null);
    setError(null);
    setNotice(null);
    setActionLoading(false);
    if (!identity || !identityKey) {
      if (!workspace || workspaceIsCloud || !cloudEnabled) {
        pendingIntentWorkspaceRef.current = null;
        setPendingSignIn(false);
      }
      setStateLoading(false);
      return undefined;
    }
    if (pendingIntentWorkspaceRef.current !== identity.rootPath) {
      pendingIntentWorkspaceRef.current = null;
      setPendingSignIn(false);
    }

    const request = Symbol("load-cloud-initialization-state");
    stateRequestRef.current = request;
    setStateLoading(true);
    const context = captureGitRepositoryContext(identity.rootPath);
    void getWorkspaceCloudInitializationState(identity)
      .then((result) => {
        if (stateRequestRef.current !== request) return;
        const published = isPublished(result.state);
        setState(published ? null : result.state);
        if (!result.ok) {
          setError(toPublicFailure(result));
          return;
        }
        setError(null);
        if (context && result.gitStatus) reconcileGitStatus(result.gitStatus, context);
        if (published) {
          clearGitSelection();
          setActiveCloudSection("contents");
        }
      })
      .catch(() => {
        if (stateRequestRef.current === request) setError({ code: "UNKNOWN", retryable: true });
      })
      .finally(() => {
        if (stateRequestRef.current === request) {
          stateRequestRef.current = null;
          setStateLoading(false);
        }
      });
    return () => {
      if (stateRequestRef.current === request) stateRequestRef.current = null;
    };
  // The normalized string is the complete authority boundary for recovery reads.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityKey]);

  useEffect(() => {
    const rootPath = identity?.rootPath;
    if (!rootPath) return undefined;
    return subscribeWorkspaceCloudInitializationProgress((event) => {
      if (event.rootPath !== rootPath || !actionRef.current) return;
      setProgress(event);
      if (event.state) setState(isPublished(event.state) ? null : event.state);
    });
  // The normalized identity key owns this subscription's authority and lifetime.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityKey]);

  const start = useCallback(async (organizationId?: string) => {
    if (!cloudEnabled || !workspace || workspaceIsCloud || actionRef.current) return;
    if (!activeCloudSession) {
      pendingIntentWorkspaceRef.current = workspace.path;
      setPendingSignIn(true);
      setError(null);
      setActiveView("cloud");
      setActiveCloudSection("initialize");
      setSidebarCollapsed(false);
      setSwitcherOpen(false);
      const started = await startCloudBrowserSignIn();
      if (!started) {
        pendingIntentWorkspaceRef.current = null;
        setPendingSignIn(false);
        setError({ code: "SESSION_REQUIRED", retryable: true });
      }
      return;
    }

    const currentIdentity = getInitializationIdentity({
      session: activeCloudSession,
      apiBaseUrl: desktopCloudApiBaseUrl,
      workspace,
      cloudEnabled,
      workspaceIsCloud,
    });
    const context = captureGitRepositoryContext(workspace.path);
    if (!currentIdentity || !context) {
      setError({ code: "REPOSITORY_REQUIRED", retryable: false });
      return;
    }

    const request = Symbol("start-cloud-initialization");
    stateRequestRef.current = null;
    setStateLoading(false);
    actionRef.current = request;
    setActionLoading(true);
    setProgress({
      rootPath: currentIdentity.rootPath,
      operationId: state?.operationId ?? null,
      stage: "validating",
      state,
      updatedAt: new Date().toISOString(),
    });
    setError(null);
    setNotice(null);
    try {
      const pending = state;
      const choosingSource = pending?.availableActions.includes("choose-source") === true;
      const freshStatus = !pending || choosingSource
        ? await getWorkspaceGitStatus(workspace.path)
        : null;
      const selectedOrganizationId = pending?.organizationId ?? organizationId?.trim() ?? "";
      const sourceBranch = choosingSource
        ? normalizeBranch(freshStatus?.branch)
        : pending?.selectedSourceBranch ?? normalizeBranch(freshStatus?.branch);
      if (!selectedOrganizationId) {
        setError({ code: "ORGANIZATION_REQUIRED", retryable: false });
        return;
      }
      const action = pending ? selectPushAction(pending.availableActions) : "initialize";
      if (!action) {
        setError({
          code: pending?.local === "source-missing" ? "SOURCE_MISSING" : "REMOTE_REF_CONFLICT",
          retryable: false,
        });
        return;
      }
      const result = await startWorkspaceCloudInitialization({
        ...currentIdentity,
        organizationId: selectedOrganizationId,
        projectName: pending?.projectName ?? workspace.name,
        sourceBranch,
        operationId: pending?.operationId ?? null,
        action,
      });
      if (actionRef.current !== request || !isGitRepositoryContextCurrent(context)) return;
      setState(result.state);
      if (!result.ok) {
        setError(toPublicFailure(result));
        return;
      }
      finishPublished(result, context);
    } catch {
      if (actionRef.current === request) setError({ code: "UNKNOWN", retryable: true });
    } finally {
      if (actionRef.current === request) {
        actionRef.current = null;
        setActionLoading(false);
        setProgress(null);
        pendingIntentWorkspaceRef.current = null;
        setPendingSignIn(false);
      }
    }
  }, [
    activeCloudSession,
    captureGitRepositoryContext,
    cloudEnabled,
    desktopCloudApiBaseUrl,
    finishPublished,
    isGitRepositoryContextCurrent,
    setActiveCloudSection,
    setActiveView,
    setSidebarCollapsed,
    setSwitcherOpen,
    startCloudBrowserSignIn,
    state,
    workspace,
    workspaceIsCloud,
  ]);

  const cleanup = useCallback(async () => {
    if (
      !identity
      || !state
      || !state.availableActions.some((action) => ["delete-empty-project", "finish-cleanup"].includes(action))
      || actionRef.current
    ) return;
    const context = captureGitRepositoryContext(identity.rootPath);
    if (!context) return;
    const request = Symbol("cleanup-cloud-initialization");
    actionRef.current = request;
    setActionLoading(true);
    setProgress(null);
    setError(null);
    setNotice(null);
    try {
      const result = await cleanupWorkspaceCloudInitialization({
        ...identity,
        operationId: state.operationId,
      });
      if (actionRef.current !== request || !isGitRepositoryContextCurrent(context)) return;
      setState(result.state);
      if (!result.ok) {
        setError(toPublicFailure(result));
        return;
      }
      reconcileGitStatus(result.gitStatus, context);
      setState(null);
      setNotice("cleanup-completed");
      setActiveCloudSection("initialize");
      setActiveView("cloud");
    } catch {
      if (actionRef.current === request) setError({ code: "UNKNOWN", retryable: true });
    } finally {
      if (actionRef.current === request) {
        actionRef.current = null;
        setActionLoading(false);
      }
    }
  }, [
    captureGitRepositoryContext,
    identity,
    isGitRepositoryContextCurrent,
    reconcileGitStatus,
    setActiveCloudSection,
    setActiveView,
    state,
  ]);

  useEffect(() => {
    if (!pendingSignIn || activeCloudSession) return undefined;
    return onDesktopCloudAuthError(() => {
      pendingIntentWorkspaceRef.current = null;
      setPendingSignIn(false);
      setError({ code: "SESSION_REQUIRED", retryable: true });
    });
  }, [activeCloudSession, pendingSignIn]);

  return {
    cloudInitializationError: error,
    cloudInitializationLoading: actionLoading,
    cloudInitializationNotice: notice,
    cloudInitializationPending: pendingSignIn,
    cloudInitializationProgress: progress,
    cloudInitializationState: state,
    cloudInitializationStateLoading: stateLoading,
    handleCleanupCloudInitialization: cleanup,
    handleStartCloudInitialization: start,
  };
}

function getInitializationIdentity({
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

function normalizeBranch(value: string | null | undefined): string {
  const normalized = value?.trim() ?? "";
  return ["head", "detached"].includes(normalized.toLowerCase()) ? "" : normalized;
}

function selectPushAction(
  actions: readonly CloudInitializationAction[],
): "retry-push" | "push-latest" | "choose-source" | "reconcile" | null {
  if (actions.includes("reconcile")) return "reconcile";
  if (actions.includes("choose-source")) return "choose-source";
  if (actions.includes("push-latest")) return "push-latest";
  if (actions.includes("retry-push")) return "retry-push";
  return null;
}

function isPublished(state: CloudInitializationState | null | undefined): boolean {
  return state?.push === "accepted" || state?.project === "published" && state.push !== "conflict";
}

function toPublicFailure(
  result: Extract<CloudInitializationResult, { ok: false }>,
): CloudInitializationFailure {
  return { code: result.error.code, retryable: result.error.retryable };
}
