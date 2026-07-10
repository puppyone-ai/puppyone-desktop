import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Workspace } from "@puppyone/shared-ui";
import {
  checkoutWorkspaceGitBranch,
  commitAndCheckoutWorkspaceGitBranch,
  commitWorkspaceGit,
  discardAllWorkspaceGitChanges,
  discardWorkspaceGitPaths,
  getWorkspaceGitBranchGraph,
  cancelWorkspaceGitBranchGraph,
  getWorkspaceGitCommitDetail,
  getWorkspaceGitFileDiff,
  initializeWorkspaceGitRepository,
  publishWorkspaceGitBranch,
  pullWorkspaceGit,
  pushWorkspaceGit,
  stageAllWorkspaceGitChanges,
  stageWorkspaceGitPaths,
  stashAndCheckoutWorkspaceGitBranch,
  unstageAllWorkspaceGitChanges,
  unstageWorkspaceGitPaths,
} from "../../lib/localFiles";
import type { GitCommitDetail, GitStatusSnapshot } from "../../types/electron";
import {
  createGitOperationErrorState,
  createGitOperationMessageState,
  formatGitOperationError,
  formatGitPreviewError,
  getGitChangeCount,
  isBranchOverwriteError,
  type GitOperationErrorState,
} from "./operationDialogs";
import { createRepositoryRefreshReason } from "./repositoryRefreshPolicy";
import type { GitMainPanel, GitWorkingSelection } from "./types";
import { useGitRepositoryLifecycle } from "./useGitRepositoryLifecycle";

export type PendingBranchSwitch = {
  branchName: string;
  remote: boolean;
  changeCount: number;
  error: string | null;
};

type UseDesktopGitControllerOptions = {
  workspace: Workspace | null;
  gitViewActive: boolean;
  onWorkspaceContentChanged: () => void;
  onEnterGitView: () => void;
};

export function useDesktopGitController({
  workspace,
  gitViewActive,
  onWorkspaceContentChanged,
  onEnterGitView,
}: UseDesktopGitControllerOptions) {
  const {
    activeGitStatus,
    gitStatus,
    gitStatusError,
    gitStatusLoading,
    gitStatusPath,
    applyGitHistory,
    applyGitStatus,
    captureGitRepositoryContext,
    historyEpoch,
    invalidateGitStatus,
    isGitRepositoryContextCurrent,
    refreshGitStatus,
    refreshGitStatusWithFetch,
    reportGitStatusError,
  } = useGitRepositoryLifecycle({ workspace, onWorkspaceContentChanged });
  const historyRequestRef = useRef(0);
  const branchSwitcherRef = useRef<HTMLDivElement>(null);
  const [selectedGitCommitId, setSelectedGitCommitId] = useState<string | null>(null);
  const [selectedGitWorkingFile, setSelectedGitWorkingFile] = useState<GitWorkingSelection | null>(null);
  const [gitMainPanel, setGitMainPanel] = useState<GitMainPanel>("changes");
  const [gitCommitDetail, setGitCommitDetail] = useState<GitCommitDetail | null>(null);
  const [gitCommitDetailLoading, setGitCommitDetailLoading] = useState(false);
  const [gitCommitDetailError, setGitCommitDetailError] = useState<string | null>(null);
  const [gitWorkingFileDiff, setGitWorkingFileDiff] = useState<GitCommitDetail | null>(null);
  const [gitWorkingFileDiffLoading, setGitWorkingFileDiffLoading] = useState(false);
  const [gitWorkingFileDiffError, setGitWorkingFileDiffError] = useState<string | null>(null);
  const [gitOperationLoading, setGitOperationLoading] = useState<string | null>(null);
  const [gitOperationError, setGitOperationError] = useState<GitOperationErrorState | null>(null);
  const [branchSwitcherOpen, setBranchSwitcherOpen] = useState(false);
  const [pendingBranchSwitch, setPendingBranchSwitch] = useState<PendingBranchSwitch | null>(null);

  const gitIncomingCount = activeGitStatus?.isRepo === true
    ? Math.max(0, activeGitStatus.sourceControl.remote.behind)
    : 0;

  const localBranches = useMemo(
    () => activeGitStatus?.branches.filter((branch) => !branch.remote) ?? [],
    [activeGitStatus],
  );
  const remoteBranches = useMemo(
    () => activeGitStatus?.branches.filter((branch) => branch.remote) ?? [],
    [activeGitStatus],
  );

  const clearGitSelection = useCallback(() => {
    setSelectedGitCommitId(null);
    setSelectedGitWorkingFile(null);
  }, []);

  useEffect(() => {
    setSelectedGitCommitId(null);
    setSelectedGitWorkingFile(null);
    setGitCommitDetail(null);
    setGitCommitDetailError(null);
    setGitCommitDetailLoading(false);
    setGitWorkingFileDiff(null);
    setGitWorkingFileDiffError(null);
    setGitWorkingFileDiffLoading(false);
    setGitOperationError(null);
    setGitOperationLoading(null);
    setBranchSwitcherOpen(false);
    setPendingBranchSwitch(null);
  }, [workspace?.path]);

  // Lazy-load history/graph when the History surface is active, or when HEAD/refs
  // change while History is already open (cached history was cleared).
  useEffect(() => {
    if (!gitViewActive || gitMainPanel !== "history" || !workspace || !activeGitStatus?.isRepo) {
      return undefined;
    }

    const context = captureGitRepositoryContext(workspace.path);
    if (!context) return undefined;
    const headCommitId = activeGitStatus.headCommitId;
    const requestHistoryEpoch = historyEpoch;
    const alreadyLoaded = (activeGitStatus.allCommits?.length ?? 0) > 0
      || (activeGitStatus.commits?.length ?? 0) > 0;
    // If we already have history for this HEAD + history epoch, keep it.
    if (alreadyLoaded) return undefined;

    const requestId = `history-${++historyRequestRef.current}`;
    let cancelled = false;
    void getWorkspaceGitBranchGraph(context.rootPath, { requestId })
      .then((graph) => {
        if (cancelled) return;
        applyGitHistory(context, headCommitId, requestHistoryEpoch, graph);
      })
      .catch((error) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        if (/cancelled|ABORT_ERR/i.test(message)) return;
        reportGitStatusError(context, error);
      });

    return () => {
      cancelled = true;
      void cancelWorkspaceGitBranchGraph(requestId);
    };
  }, [
    activeGitStatus?.allCommits?.length,
    activeGitStatus?.branch,
    activeGitStatus?.commits?.length,
    activeGitStatus?.headCommitId,
    activeGitStatus?.isRepo,
    applyGitHistory,
    captureGitRepositoryContext,
    gitMainPanel,
    gitViewActive,
    historyEpoch,
    reportGitStatusError,
    workspace,
  ]);

  useEffect(() => {
    if (!gitViewActive || !activeGitStatus?.isRepo) return;

    const historyCommits = activeGitStatus.allCommits ?? activeGitStatus.commits;
    const selectedCommitExists = selectedGitCommitId
      ? historyCommits.some((commit) => commit.commit_id === selectedGitCommitId)
      : false;

    if (gitMainPanel === "history") {
      if (!selectedGitCommitId || !selectedCommitExists) {
        setSelectedGitCommitId(historyCommits[0]?.commit_id ?? null);
      }
    } else if (selectedGitCommitId && !selectedCommitExists) {
      setSelectedGitCommitId(null);
    }

    if (selectedGitWorkingFile) {
      const source = selectedGitWorkingFile.origin === "remote"
        ? activeGitStatus.sourceControl.remote.incomingPreview
        : selectedGitWorkingFile.origin === "committed"
          ? activeGitStatus.sourceControl.remote.outgoingPreview
          : selectedGitWorkingFile.staged ? activeGitStatus.stagedEntries : [
            ...activeGitStatus.unstagedEntries,
            ...activeGitStatus.untrackedEntries,
          ];
      if (!source.some((entry) => entry.path === selectedGitWorkingFile.path)) {
        setSelectedGitWorkingFile(null);
      }
    }
  }, [activeGitStatus, gitMainPanel, gitViewActive, selectedGitCommitId, selectedGitWorkingFile]);

  useEffect(() => {
    if (!gitViewActive || !workspace || !selectedGitCommitId) {
      setGitCommitDetail(null);
      setGitCommitDetailError(null);
      setGitCommitDetailLoading(false);
      return undefined;
    }

    let cancelled = false;
    setGitCommitDetailLoading(true);
    setGitCommitDetailError(null);
    getWorkspaceGitCommitDetail(workspace.path, selectedGitCommitId)
      .then((detail) => {
        if (!cancelled) setGitCommitDetail(detail);
      })
      .catch((error) => {
        if (!cancelled) {
          setGitCommitDetail(null);
          setGitCommitDetailError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled) setGitCommitDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [gitViewActive, selectedGitCommitId, workspace]);

  useEffect(() => {
    if (!gitViewActive || !workspace || !selectedGitWorkingFile) {
      setGitWorkingFileDiff(null);
      setGitWorkingFileDiffError(null);
      setGitWorkingFileDiffLoading(false);
      return undefined;
    }

    let cancelled = false;
    const scope = selectedGitWorkingFile.origin === "remote"
      ? "remote"
      : selectedGitWorkingFile.origin === "committed"
        ? "committed"
        : selectedGitWorkingFile.staged
          ? "staged"
          : selectedGitWorkingFile.status === "untracked"
            ? "untracked"
            : "unstaged";

    setGitWorkingFileDiffLoading(true);
    setGitWorkingFileDiffError(null);
    getWorkspaceGitFileDiff(workspace.path, selectedGitWorkingFile.path, scope)
      .then((detail) => {
        if (!cancelled) setGitWorkingFileDiff(detail);
      })
      .catch((error) => {
        if (!cancelled) {
          setGitWorkingFileDiff(null);
          setGitWorkingFileDiffError(formatGitPreviewError(error));
        }
      })
      .finally(() => {
        if (!cancelled) setGitWorkingFileDiffLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [gitViewActive, selectedGitWorkingFile, workspace]);

  const runGitOperation = useCallback(async (
    label: string,
    operation: (rootPath: string) => Promise<GitStatusSnapshot>,
    options: { showRendererError?: boolean } = {},
  ) => {
    if (!workspace) return false;
    const context = captureGitRepositoryContext(workspace.path);
    if (!context) return false;

    setGitOperationLoading(label);
    setGitOperationError(null);
    try {
      const nextStatus = await operation(context.rootPath);
      const applied = applyGitStatus(
        nextStatus,
        context,
        createRepositoryRefreshReason(label, "mutation"),
      );
      if (!applied) return false;
      onWorkspaceContentChanged();
      return true;
    } catch (error) {
      if (isGitRepositoryContextCurrent(context) && options.showRendererError !== false) {
        setGitOperationError(createGitOperationErrorState(error, label, context.rootPath));
      }
      return false;
    } finally {
      if (isGitRepositoryContextCurrent(context)) setGitOperationLoading(null);
    }
  }, [
    applyGitStatus,
    captureGitRepositoryContext,
    isGitRepositoryContextCurrent,
    onWorkspaceContentChanged,
    workspace,
  ]);

  const selectGitCommit = useCallback((commitId: string) => {
    setGitMainPanel("history");
    setSelectedGitCommitId(commitId);
    setSelectedGitWorkingFile(null);
  }, []);

  const selectGitWorkingFile = useCallback((selection: GitWorkingSelection | null) => {
    if (selection) setGitMainPanel("changes");
    setSelectedGitWorkingFile(selection);
    setSelectedGitCommitId(null);
  }, []);

  const selectGitMainPanel = useCallback((panel: GitMainPanel) => {
    setGitMainPanel(panel);
    if (panel === "changes") {
      setSelectedGitCommitId(null);
    } else {
      const historyCommits = activeGitStatus?.allCommits ?? activeGitStatus?.commits ?? [];
      setSelectedGitWorkingFile(null);
      setSelectedGitCommitId((current) => current ?? historyCommits[0]?.commit_id ?? null);
    }
  }, [activeGitStatus]);

  const handleStageGitPaths = useCallback((paths: string[]) => {
    return runGitOperation("stage", (rootPath) => stageWorkspaceGitPaths(rootPath, paths));
  }, [runGitOperation]);

  const handleStageAllGitChanges = useCallback(() => {
    return runGitOperation("stage", (rootPath) => stageAllWorkspaceGitChanges(rootPath));
  }, [runGitOperation]);

  const handleStageAndCommitGit = useCallback(async () => {
    if (!workspace) return false;
    const context = captureGitRepositoryContext(workspace.path);
    if (!context) return false;

    setGitOperationLoading("stage-commit");
    setGitOperationError(null);
    try {
      let nextStatus = await stageAllWorkspaceGitChanges(context.rootPath);
      if (nextStatus.stagedEntries.length === 0) {
        if (!applyGitStatus(
          nextStatus,
          context,
          createRepositoryRefreshReason("stage", "mutation"),
        )) return false;
        onWorkspaceContentChanged();
        return false;
      }

      nextStatus = await commitWorkspaceGit(context.rootPath, "");
      if (!applyGitStatus(
        nextStatus,
        context,
        createRepositoryRefreshReason("commit", "mutation"),
      )) return false;
      clearGitSelection();
      onWorkspaceContentChanged();
      return true;
    } catch (error) {
      if (isGitRepositoryContextCurrent(context)) {
        setGitOperationError(createGitOperationErrorState(error, "stage-commit", context.rootPath));
      }
      return false;
    } finally {
      if (isGitRepositoryContextCurrent(context)) setGitOperationLoading(null);
    }
  }, [
    applyGitStatus,
    captureGitRepositoryContext,
    clearGitSelection,
    isGitRepositoryContextCurrent,
    onWorkspaceContentChanged,
    workspace,
  ]);

  const handleUnstageGitPaths = useCallback((paths: string[]) => {
    return runGitOperation("unstage", (rootPath) => unstageWorkspaceGitPaths(rootPath, paths));
  }, [runGitOperation]);

  const handleUnstageAllGitChanges = useCallback(() => {
    return runGitOperation("unstage", (rootPath) => unstageAllWorkspaceGitChanges(rootPath));
  }, [runGitOperation]);

  const handleDiscardGitPaths = useCallback((paths: string[]) => {
    if (paths.length === 0) {
      setGitOperationError(createGitOperationMessageState("Select a changed file to discard, or use Discard All.", "discard", workspace?.path ?? null));
      return Promise.resolve(false);
    }
    const label = paths.length === 1 ? paths[0] : `${paths.length} files`;
    if (!window.confirm(`Discard local changes in ${label}? This cannot be undone.`)) {
      return Promise.resolve(false);
    }
    return runGitOperation("discard", (rootPath) => discardWorkspaceGitPaths(rootPath, paths));
  }, [runGitOperation, workspace]);

  const handleDiscardAllGitChanges = useCallback(() => {
    const discardableCount = activeGitStatus?.sourceControl.groups
      .filter((group) => group.id === "workingTree" || group.id === "untracked" || group.id === "merge")
      .reduce((total, group) => total + group.resources.length, 0) ?? 0;
    if (discardableCount === 0) {
      setGitOperationError(null);
      return Promise.resolve(false);
    }
    if (!window.confirm(`Discard local changes in ${discardableCount} files? This cannot be undone.`)) {
      return Promise.resolve(false);
    }
    return runGitOperation("discard", (rootPath) => discardAllWorkspaceGitChanges(rootPath));
  }, [activeGitStatus, runGitOperation]);

  const handleCommitGit = useCallback(async () => {
    if (!workspace) return false;
    const context = captureGitRepositoryContext(workspace.path);
    if (!context) return false;

    setGitOperationLoading("commit");
    setGitOperationError(null);
    try {
      const nextStatus = await commitWorkspaceGit(context.rootPath, "");
      if (!applyGitStatus(
        nextStatus,
        context,
        createRepositoryRefreshReason("commit", "mutation"),
      )) return false;
      clearGitSelection();
      onWorkspaceContentChanged();
      return true;
    } catch (error) {
      if (isGitRepositoryContextCurrent(context)) {
        setGitOperationError(createGitOperationErrorState(error, "commit", context.rootPath));
      }
      return false;
    } finally {
      if (isGitRepositoryContextCurrent(context)) setGitOperationLoading(null);
    }
  }, [
    applyGitStatus,
    captureGitRepositoryContext,
    clearGitSelection,
    isGitRepositoryContextCurrent,
    onWorkspaceContentChanged,
    workspace,
  ]);

  const handleCommitAndPushGit = useCallback(async () => {
    if (!workspace) return false;
    const context = captureGitRepositoryContext(workspace.path);
    if (!context) return false;

    const remote = activeGitStatus?.sourceControl.remote;
    if (!remote?.target && !remote?.upstream) {
      setGitOperationError(createGitOperationMessageState("Connect a Git remote before committing and pushing.", "commit-push", workspace.path));
      return false;
    }
    if (remote.behind > 0) {
      setGitOperationError(createGitOperationMessageState("Pull remote changes before committing and pushing.", "commit-push", workspace.path));
      return false;
    }

    setGitOperationLoading("commit-push");
    setGitOperationError(null);
    try {
      let nextStatus = await commitWorkspaceGit(context.rootPath, "");
      if (nextStatus.sourceControl.remote.canPublish) {
        nextStatus = await publishWorkspaceGitBranch(context.rootPath);
      } else {
        nextStatus = await pushWorkspaceGit(context.rootPath);
      }
      if (!applyGitStatus(
        nextStatus,
        context,
        createRepositoryRefreshReason("push", "mutation"),
      )) return false;
      clearGitSelection();
      onWorkspaceContentChanged();
      return true;
    } catch (error) {
      if (isGitRepositoryContextCurrent(context)) {
        setGitOperationError(createGitOperationErrorState(error, "commit-push", context.rootPath));
      }
      return false;
    } finally {
      if (isGitRepositoryContextCurrent(context)) setGitOperationLoading(null);
    }
  }, [
    activeGitStatus,
    applyGitStatus,
    captureGitRepositoryContext,
    clearGitSelection,
    isGitRepositoryContextCurrent,
    onWorkspaceContentChanged,
    workspace,
  ]);

  const handlePullGit = useCallback(() => {
    return runGitOperation("pull", (rootPath) => pullWorkspaceGit(rootPath));
  }, [runGitOperation]);

  const handlePushGit = useCallback(() => {
    return runGitOperation("push", (rootPath) => pushWorkspaceGit(rootPath));
  }, [runGitOperation]);

  const handlePublishGitBranch = useCallback(() => {
    return runGitOperation("publish", (rootPath) => publishWorkspaceGitBranch(rootPath));
  }, [runGitOperation]);

  const handleCheckoutGitBranch = useCallback(async (branchName: string, remote: boolean) => {
    if (!workspace || gitStatusPath !== workspace.path || !activeGitStatus?.isRepo) {
      setGitOperationError(createGitOperationMessageState("Current workspace is not a Git repository.", "checkout", workspace?.path ?? null));
      return false;
    }
    const context = captureGitRepositoryContext(workspace.path);
    if (!context) return false;

    setGitOperationLoading("checkout");
    setGitOperationError(null);
    setPendingBranchSwitch(null);
    try {
      const nextStatus = await checkoutWorkspaceGitBranch(context.rootPath, branchName, remote);
      if (!applyGitStatus(
        nextStatus,
        context,
        createRepositoryRefreshReason("checkout", "mutation"),
      )) return false;
      onWorkspaceContentChanged();
      clearGitSelection();
      setGitMainPanel("changes");
      return true;
    } catch (error) {
      if (!isGitRepositoryContextCurrent(context)) return false;
      const formatted = formatGitOperationError(error, "checkout");
      if (isBranchOverwriteError(formatted)) {
        setPendingBranchSwitch({
          branchName,
          remote,
          changeCount: getGitChangeCount(activeGitStatus),
          error: null,
        });
        setBranchSwitcherOpen(false);
      } else {
        setGitOperationError(createGitOperationErrorState(error, "checkout", context.rootPath));
      }
      return false;
    } finally {
      if (isGitRepositoryContextCurrent(context)) setGitOperationLoading(null);
    }
  }, [
    activeGitStatus,
    applyGitStatus,
    captureGitRepositoryContext,
    clearGitSelection,
    gitStatusPath,
    isGitRepositoryContextCurrent,
    onWorkspaceContentChanged,
    workspace,
  ]);

  const handleStashAndCheckoutBranch = useCallback(async () => {
    if (!workspace || !pendingBranchSwitch) return false;
    const context = captureGitRepositoryContext(workspace.path);
    if (!context) return false;

    setGitOperationLoading("stash");
    setGitOperationError(null);
    try {
      const nextStatus = await stashAndCheckoutWorkspaceGitBranch(
        context.rootPath,
        pendingBranchSwitch.branchName,
        pendingBranchSwitch.remote,
      );
      if (!applyGitStatus(
        nextStatus,
        context,
        createRepositoryRefreshReason("stash-checkout", "mutation"),
      )) return false;
      onWorkspaceContentChanged();
      clearGitSelection();
      setGitMainPanel("changes");
      setPendingBranchSwitch(null);
      return true;
    } catch (error) {
      if (isGitRepositoryContextCurrent(context)) {
        setGitOperationError(createGitOperationErrorState(error, "checkout", context.rootPath));
        setPendingBranchSwitch((current) => current ? { ...current, error: "Could not stash changes. Review changes and try again." } : current);
      }
      return false;
    } finally {
      if (isGitRepositoryContextCurrent(context)) setGitOperationLoading(null);
    }
  }, [
    applyGitStatus,
    captureGitRepositoryContext,
    clearGitSelection,
    isGitRepositoryContextCurrent,
    onWorkspaceContentChanged,
    pendingBranchSwitch,
    workspace,
  ]);

  const handleCommitAndCheckoutBranch = useCallback(async () => {
    if (!workspace || !pendingBranchSwitch) return false;
    const context = captureGitRepositoryContext(workspace.path);
    if (!context) return false;

    setGitOperationLoading("commit-switch");
    setGitOperationError(null);
    try {
      const nextStatus = await commitAndCheckoutWorkspaceGitBranch(
        context.rootPath,
        pendingBranchSwitch.branchName,
        pendingBranchSwitch.remote,
      );
      if (!applyGitStatus(
        nextStatus,
        context,
        createRepositoryRefreshReason("commit-checkout", "mutation"),
      )) return false;
      onWorkspaceContentChanged();
      clearGitSelection();
      setGitMainPanel("changes");
      setPendingBranchSwitch(null);
      return true;
    } catch (error) {
      if (!isGitRepositoryContextCurrent(context)) return false;
      const formatted = formatGitOperationError(error, "commit-switch");
      setGitOperationError(createGitOperationErrorState(error, "commit-switch", context.rootPath));
      setPendingBranchSwitch((current) => current ? { ...current, error: formatted || "Could not commit changes." } : current);
      return false;
    } finally {
      if (isGitRepositoryContextCurrent(context)) setGitOperationLoading(null);
    }
  }, [
    applyGitStatus,
    captureGitRepositoryContext,
    clearGitSelection,
    isGitRepositoryContextCurrent,
    onWorkspaceContentChanged,
    pendingBranchSwitch,
    workspace,
  ]);

  const handleInitializeGitRepository = useCallback(async () => {
    const initialized = await runGitOperation("init", (rootPath) => initializeWorkspaceGitRepository(rootPath));
    if (initialized) {
      onEnterGitView();
      setGitMainPanel("changes");
      clearGitSelection();
    }
    return initialized;
  }, [clearGitSelection, onEnterGitView, runGitOperation]);

  return {
    activeGitStatus,
    branchSwitcherOpen,
    branchSwitcherRef,
    gitCommitDetail,
    gitCommitDetailError,
    gitCommitDetailLoading,
    gitIncomingCount,
    gitMainPanel,
    gitOperationError,
    gitOperationLoading,
    gitStatus,
    gitStatusError,
    gitStatusLoading,
    gitStatusPath,
    gitWorkingFileDiff,
    gitWorkingFileDiffError,
    gitWorkingFileDiffLoading,
    localBranches,
    pendingBranchSwitch,
    remoteBranches,
    selectedGitCommitId,
    selectedGitWorkingFile,
    applyGitStatus,
    captureGitRepositoryContext,
    clearGitSelection,
    dismissGitOperationError: () => setGitOperationError(null),
    handleCheckoutGitBranch,
    handleCommitAndCheckoutBranch,
    handleCommitAndPushGit,
    handleCommitGit,
    handleDiscardAllGitChanges,
    handleDiscardGitPaths,
    handleInitializeGitRepository,
    handlePublishGitBranch,
    handlePullGit,
    handlePushGit,
    handleStageAllGitChanges,
    handleStageAndCommitGit,
    handleStageGitPaths,
    handleStashAndCheckoutBranch,
    handleUnstageAllGitChanges,
    handleUnstageGitPaths,
    invalidateGitStatus,
    isGitRepositoryContextCurrent,
    refreshGitStatus,
    refreshGitStatusWithFetch,
    selectGitCommit,
    selectGitMainPanel,
    selectGitWorkingFile,
    setBranchSwitcherOpen,
    setGitOperationError,
    setGitOperationLoading,
    setPendingBranchSwitch,
  };
}

export type DesktopGitController = ReturnType<typeof useDesktopGitController>;
