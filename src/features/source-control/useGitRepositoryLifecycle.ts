import { useCallback, useEffect, useRef, useState } from "react";
import type { Workspace } from "@puppyone/shared-ui";
import {
  fetchWorkspaceGit,
  getWorkspaceGitStatus,
  startWorkspaceGitRepositoryWatch,
  stopWorkspaceGitRepositoryWatch,
  subscribeWorkspaceGitRepositoryInvalidations,
} from "../../lib/localFiles";
import type { GitBranchGraphSnapshot, GitStatusSnapshot } from "../../types/electron";
import {
  createGitRefreshScheduler,
  type GitRefreshReason,
  type GitRepositoryContext,
} from "./gitRefreshScheduler";
import {
  createRepositoryRefreshReason,
  mergePreservedHistory,
  shouldInvalidateHistoryForReason,
} from "./repositoryRefreshPolicy";

type UseGitRepositoryLifecycleOptions = {
  workspace: Workspace | null;
  onWorkspaceContentChanged: () => void;
};

export function useGitRepositoryLifecycle({
  workspace,
  onWorkspaceContentChanged,
}: UseGitRepositoryLifecycleOptions) {
  const workspacePathRef = useRef<string | null>(null);
  const gitStatusRef = useRef<GitStatusSnapshot | null>(null);
  const schedulerRef = useRef<ReturnType<typeof createGitRefreshScheduler<GitStatusSnapshot>> | null>(null);
  const historyEpochRef = useRef(0);
  const [gitStatus, setGitStatus] = useState<GitStatusSnapshot | null>(null);
  const [gitStatusPath, setGitStatusPath] = useState<string | null>(null);
  const [gitStatusLoading, setGitStatusLoading] = useState(false);
  const [gitStatusError, setGitStatusError] = useState<string | null>(null);
  const [historyEpoch, setHistoryEpoch] = useState(0);

  const activeGitStatus = gitStatusPath === workspace?.path ? gitStatus : null;

  const bumpHistoryEpoch = useCallback(() => {
    historyEpochRef.current += 1;
    setHistoryEpoch(historyEpochRef.current);
    return historyEpochRef.current;
  }, []);

  const ensureScheduler = useCallback(() => {
    if (schedulerRef.current) return schedulerRef.current;
    const created = createGitRefreshScheduler<GitStatusSnapshot>({
      readStatus: async (_generation, rootPath, signal) => getWorkspaceGitStatus(rootPath, { signal }),
      onSnapshot: (nextStatus, meta) => {
        const rootPath = workspacePathRef.current;
        const state = schedulerRef.current?.getState();
        if (!rootPath || meta.rootPath !== rootPath) return;
        if (state && meta.rootEpoch !== state.rootEpoch) return;
        const invalidateHistory = shouldInvalidateHistoryForReason(meta.reason);
        if (invalidateHistory) {
          historyEpochRef.current += 1;
          setHistoryEpoch(historyEpochRef.current);
        }
        const merged = mergePreservedHistory(gitStatusRef.current, nextStatus, { invalidateHistory });
        gitStatusRef.current = merged;
        setGitStatus(merged);
        setGitStatusPath(rootPath);
        setGitStatusError(null);
      },
      onError: (error, meta) => {
        const rootPath = workspacePathRef.current;
        const state = schedulerRef.current?.getState();
        if (!rootPath || meta.rootPath !== rootPath) return;
        if (state && meta.rootEpoch !== state.rootEpoch) return;
        setGitStatusError(error instanceof Error ? error.message : String(error));
      },
      onLog: (event) => {
        if (event.type !== "refresh-success" && event.type !== "refresh-error" && event.type !== "refresh-discarded") return;
        console.info("[git-refresh]", event.type, {
          rootPath: event.rootPath,
          rootEpoch: event.rootEpoch,
          generation: event.generation,
          cause: event.reason.cause,
          source: event.reason.source,
          detail: event.reason.detail,
          attempt: event.reason.attempt,
          durationMs: event.durationMs,
        });
      },
      onLoadingChange: (loading, generation, rootEpoch) => {
        const state = schedulerRef.current?.getState();
        if (!state || rootEpoch !== state.rootEpoch) return;
        if (!loading && generation < state.requestedGeneration && state.inFlight) return;
        setGitStatusLoading(loading);
      },
    });
    schedulerRef.current = created;
    return created;
  }, []);

  const captureGitRepositoryContext = useCallback((expectedRootPath?: string): GitRepositoryContext | null => {
    const rootPath = expectedRootPath ?? workspacePathRef.current;
    if (!rootPath || workspacePathRef.current !== rootPath) return null;
    const state = ensureScheduler().getState();
    if (state.rootPath !== rootPath) return null;
    return { rootPath, rootEpoch: state.rootEpoch };
  }, [ensureScheduler]);

  const isGitRepositoryContextCurrent = useCallback((context: GitRepositoryContext): boolean => {
    if (workspacePathRef.current !== context.rootPath) return false;
    const state = ensureScheduler().getState();
    return state.rootPath === context.rootPath && state.rootEpoch === context.rootEpoch;
  }, [ensureScheduler]);

  const applyGitStatus = useCallback((
    nextStatus: GitStatusSnapshot,
    context: GitRepositoryContext,
    reason: GitRefreshReason = createRepositoryRefreshReason("external-apply", "external"),
  ): boolean => {
    if (!isGitRepositoryContextCurrent(context)) return false;
    return ensureScheduler().applyMutationSnapshot(nextStatus, context, reason);
  }, [ensureScheduler, isGitRepositoryContextCurrent]);

  const applyGitHistory = useCallback((
    context: GitRepositoryContext,
    expectedHeadCommitId: string | null,
    expectedHistoryEpoch: number,
    graph: GitBranchGraphSnapshot,
  ): boolean => {
    if (!isGitRepositoryContextCurrent(context)) return false;
    if (historyEpochRef.current !== expectedHistoryEpoch) return false;
    const current = gitStatusRef.current;
    if (!current || current.headCommitId !== expectedHeadCommitId) return false;
    const merged = {
      ...current,
      commits: graph.commits,
      allCommits: graph.allCommits,
      totalCommits: Math.max(current.totalCommits, graph.commits.length),
    };
    gitStatusRef.current = merged;
    setGitStatus(merged);
    return true;
  }, [isGitRepositoryContextCurrent]);

  const reportGitStatusError = useCallback((context: GitRepositoryContext, error: unknown) => {
    if (!isGitRepositoryContextCurrent(context)) return;
    setGitStatusError(error instanceof Error ? error.message : String(error));
  }, [isGitRepositoryContextCurrent]);

  const refreshGitStatus = useCallback(async (detail = "manual") => {
    if (!workspacePathRef.current) return;
    ensureScheduler().refreshNow(createRepositoryRefreshReason(
      detail,
      detail === "manual" ? "manual" : "external",
    ));
  }, [ensureScheduler]);

  const invalidateGitStatus = useCallback((detail = "working-tree") => {
    if (!workspacePathRef.current) return;
    ensureScheduler().invalidate({
      reason: createRepositoryRefreshReason(detail, "external"),
      priority: "debounced",
    });
  }, [ensureScheduler]);

  const refreshGitStatusWithFetch = useCallback(async () => {
    if (!workspace) return;
    const context = captureGitRepositoryContext(workspace.path);
    if (!context) return;
    setGitStatusError(null);
    try {
      const nextStatus = await fetchWorkspaceGit(context.rootPath);
      applyGitStatus(nextStatus, context, createRepositoryRefreshReason("fetch", "mutation"));
    } catch (error) {
      reportGitStatusError(context, error);
    }
  }, [applyGitStatus, captureGitRepositoryContext, reportGitStatusError, workspace]);

  useEffect(() => {
    workspacePathRef.current = workspace?.path ?? null;
    gitStatusRef.current = null;
    historyEpochRef.current += 1;
    setHistoryEpoch(historyEpochRef.current);
    setGitStatus(null);
    setGitStatusPath(null);
    setGitStatusError(null);
    ensureScheduler().setRootPath(workspace?.path ?? null);
  }, [ensureScheduler, workspace?.path]);

  useEffect(() => {
    const rootPath = workspace?.path ?? null;
    if (!rootPath) return undefined;

    const scheduler = ensureScheduler();
    let cancelled = false;
    let metadataSubscriptionId: string | null = null;
    let stopContentWatch: (() => void) | null = null;
    const unsubscribeInvalidations = subscribeWorkspaceGitRepositoryInvalidations((event) => {
      if (cancelled) return;
      if (metadataSubscriptionId && event.subscriptionId !== metadataSubscriptionId) return;
      if (!metadataSubscriptionId && event.rootPath !== rootPath) return;
      scheduler.invalidate({
        reason: createRepositoryRefreshReason(event.reason || "git-metadata", "watcher"),
        priority: "debounced",
      });
    });

    const bridge = window.puppyoneDesktop;
    const contentWatch = typeof bridge?.watchWorkspace === "function"
      ? bridge.watchWorkspace(rootPath, (event) => {
        if (cancelled) return;
        if (event.error && !("recovered" in event && event.recovered)) return;
        onWorkspaceContentChanged();
        scheduler.invalidate({
          reason: createRepositoryRefreshReason("working-tree", "watcher"),
          priority: "debounced",
        });
      })
      : null;
    stopContentWatch = contentWatch?.stop ?? null;

    void (async () => {
      try {
        const contentReady = contentWatch?.ready ?? Promise.resolve(null);
        const [metadataResult] = await Promise.all([
          startWorkspaceGitRepositoryWatch(rootPath),
          contentReady.catch(() => null),
        ]);
        if (cancelled) {
          if (metadataResult?.subscriptionId) {
            await stopWorkspaceGitRepositoryWatch(metadataResult.subscriptionId);
          }
          return;
        }
        metadataSubscriptionId = metadataResult?.subscriptionId ?? null;
      } catch (error) {
        if (!cancelled && workspacePathRef.current === rootPath) {
          setGitStatusError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled && workspacePathRef.current === rootPath) {
          scheduler.refreshNow(createRepositoryRefreshReason("initial", "initial"));
        }
      }
    })();

    return () => {
      cancelled = true;
      unsubscribeInvalidations();
      stopContentWatch?.();
      if (metadataSubscriptionId) void stopWorkspaceGitRepositoryWatch(metadataSubscriptionId);
    };
  }, [ensureScheduler, onWorkspaceContentChanged, workspace?.path]);

  useEffect(() => {
    const scheduler = ensureScheduler();
    const syncFocus = () => {
      const focused = typeof document === "undefined"
        ? true
        : document.visibilityState === "visible"
          && (typeof document.hasFocus !== "function" || document.hasFocus());
      scheduler.setFocused(focused);
    };
    syncFocus();
    window.addEventListener("focus", syncFocus);
    window.addEventListener("blur", syncFocus);
    document.addEventListener("visibilitychange", syncFocus);
    const bridge = window.puppyoneDesktop;
    const unsubscribeWindowFocus = typeof bridge?.onGitRepositoryWindowFocus === "function"
      ? bridge.onGitRepositoryWindowFocus((event) => scheduler.setFocused(event.focused))
      : () => {};
    return () => {
      window.removeEventListener("focus", syncFocus);
      window.removeEventListener("blur", syncFocus);
      document.removeEventListener("visibilitychange", syncFocus);
      unsubscribeWindowFocus();
    };
  }, [ensureScheduler]);

  useEffect(() => () => {
    schedulerRef.current?.dispose();
    schedulerRef.current = null;
  }, []);

  return {
    activeGitStatus,
    gitStatus,
    gitStatusError,
    gitStatusLoading,
    gitStatusPath,
    historyEpoch,
    applyGitHistory,
    applyGitStatus,
    bumpHistoryEpoch,
    captureGitRepositoryContext,
    invalidateGitStatus,
    isGitRepositoryContextCurrent,
    refreshGitStatus,
    refreshGitStatusWithFetch,
    reportGitStatusError,
  };
}
