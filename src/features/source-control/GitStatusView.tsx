import type { ReactNode } from "react";
import { GitBranch, RefreshCw } from "lucide-react";
import type { Workspace } from "@puppyone/shared-ui";
import { bidiIsolate, useLocalization } from "@puppyone/localization";
import type { GitCommitDetail, GitCommitSummary, GitStatusSnapshot } from "../../types/electron";
import type { GitMainPanel, GitWorkingSelection } from "./types";
import { displayGitBranch } from "./viewModel";
import { GitFileDiffSurface } from "./diff/GitFileDiffSurface";
import { WorkingFileDetail } from "./WorkingFileDetail";
import { VersionControlSetupState } from "./VersionControlSetupState";

type GitStatusViewProps = {
  workspace: Workspace;
  status: GitStatusSnapshot | null;
  activePanel: GitMainPanel;
  selectedCommitId: string | null;
  selectedWorkingFile: GitWorkingSelection | null;
  commitDetail: GitCommitDetail | null;
  commitDetailLoading: boolean;
  commitDetailError: string | null;
  workingFileDiff: GitCommitDetail | null;
  workingFileDiffLoading: boolean;
  workingFileDiffError: string | null;
  operationLoading: string | null;
  operationError: string | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onStagePaths: (paths: string[]) => Promise<boolean>;
  onUnstagePaths: (paths: string[]) => Promise<boolean>;
  onDiscardPaths: (paths: string[]) => Promise<boolean>;
  onOpenWorkingFile: (path: string) => void;
  onInitializeRepository: () => Promise<boolean>;
};

export function GitStatusView({
  workspace,
  status,
  activePanel,
  selectedCommitId,
  selectedWorkingFile,
  commitDetail,
  commitDetailLoading,
  commitDetailError,
  workingFileDiff,
  workingFileDiffLoading,
  workingFileDiffError,
  operationLoading,
  operationError,
  loading,
  error,
  onRefresh,
  onStagePaths,
  onUnstagePaths,
  onDiscardPaths,
  onOpenWorkingFile,
  onInitializeRepository,
}: GitStatusViewProps) {
  const { t } = useLocalization();
  const commits = status?.commits ?? [];
  const historyCommits = status?.allCommits ?? commits;
  const selectedCommit =
    historyCommits.find((commit) => commit.commit_id === selectedCommitId) ??
    (activePanel === "history" ? historyCommits[0] ?? null : null);

  if (error) {
    return <UtilityEmptyState tone="danger" message={error} onRefresh={onRefresh} loading={loading} />;
  }

  if (status && !status.isRepo) {
    return (
      <VersionControlSetupState
        operationError={operationError}
        enabling={Boolean(operationLoading)}
        onEnable={() => void onInitializeRepository()}
      />
    );
  }

  if (loading && !status) {
    return <UtilityEmptyState message={t("source-control.status.readingHistory")} loading={loading} />;
  }

  if (activePanel === "history") {
    return (
      <GitHistoryPanel
        commits={historyCommits}
        selectedCommit={selectedCommit}
        headCommitId={status?.headCommitId ?? null}
        commitDetail={commitDetail}
        commitDetailLoading={commitDetailLoading}
        commitDetailError={commitDetailError}
        status={status}
        operationError={operationError}
        loading={loading}
        onRefresh={onRefresh}
      />
    );
  }

  if (selectedWorkingFile) {
    return (
      <WorkingFileDetail
        selection={selectedWorkingFile}
        detail={workingFileDiff}
        loading={workingFileDiffLoading}
        error={workingFileDiffError}
        operationLoading={operationLoading}
        operationError={operationError}
        onStagePaths={onStagePaths}
        onUnstagePaths={onUnstagePaths}
        onDiscardPaths={onDiscardPaths}
        onOpenFile={onOpenWorkingFile}
      />
    );
  }

  return (
    <GitOverview
      workspace={workspace}
      status={status}
      loading={loading}
      operationLoading={operationLoading}
      operationError={operationError}
      onRefresh={onRefresh}
    />
  );
}

function GitHistoryPanel({
  commits,
  selectedCommit,
  headCommitId,
  commitDetail,
  commitDetailLoading,
  commitDetailError,
  status,
  operationError,
  loading,
  onRefresh,
}: {
  commits: GitCommitSummary[];
  selectedCommit: GitCommitSummary | null;
  headCommitId: string | null;
  commitDetail: GitCommitDetail | null;
  commitDetailLoading: boolean;
  commitDetailError: string | null;
  status: GitStatusSnapshot | null;
  operationError: string | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  if (commits.length === 0) {
    return (
      <section className="desktop-utility-view desktop-history-detail-view">
        <div className="desktop-history-detail-scroll" data-po-scrollbar="content">
          <EmptyGitHistoryState status={status} operationError={operationError} onRefresh={onRefresh} loading={loading} />
        </div>
      </section>
    );
  }

  return (
    <section className="desktop-utility-view desktop-history-detail-view">
      <div className="desktop-history-detail-scroll" data-po-scrollbar="content">
        {selectedCommit ? (
          <CommitDetail
            commit={selectedCommit}
            detail={commitDetail}
            loading={commitDetailLoading}
            error={commitDetailError}
            isHead={selectedCommit.commit_id === headCommitId}
          />
        ) : (
          <EmptyGitHistoryState status={status} operationError={operationError} onRefresh={onRefresh} loading={loading} />
        )}
      </div>
    </section>
  );
}

function CommitDetail({
  commit,
  detail,
  loading,
  error,
  isHead,
}: {
  commit: GitCommitSummary;
  detail: GitCommitDetail | null;
  loading: boolean;
  error: string | null;
  isHead: boolean;
}) {
  const { t, formatDate, formatNumber, formatRelativeTime } = useLocalization();
  const files = detail?.files ?? [];
  const totals = getChangeTotals(files.length > 0 ? files : commit.changes);

  return (
    <div className="desktop-commit-detail">
      <div className="desktop-commit-summary">
        <div className="desktop-commit-id-row">
          <strong title={commit.commit_id}>{shortCommit(commit.commit_id)}</strong>
          {isHead && <span className="desktop-head-badge">HEAD</span>}
        </div>
        <p><bdi>{commit.message || t("source-control.commit.noMessage")}</bdi></p>
        <div className="desktop-commit-meta">
          <bdi>{commit.author_name}</bdi>
          <span title={formatGitFullTime(commit.created_at, formatDate)}>{formatGitRelativeTime(commit.created_at, formatDate, formatRelativeTime)}</span>
          <span>{t("source-control.commit.parentCount", { count: commit.parent_ids.length })}</span>
        </div>
      </div>

      <div className="desktop-commit-stats">
        <span>
          {t("source-control.commit.filesChanged", { count: totals.files })}
        </span>
        <span className="added">+{formatNumber(totals.additions)}</span>
        <span className="deleted">-{formatNumber(totals.deletions)}</span>
      </div>

      {loading ? (
        <div className="desktop-utility-empty">{t("source-control.status.loadingDiff")}</div>
      ) : error ? (
        <div className="desktop-utility-empty danger">{error}</div>
      ) : files.length > 0 ? (
        <div className="desktop-file-diff-list">
          {files.map((file) => (
            <GitFileDiffSurface file={file} key={`${file.status}:${file.oldPath ?? ""}:${file.path}`} />
          ))}
        </div>
      ) : commit.changes.length > 0 ? (
        <div className="desktop-file-diff-list">
          {commit.changes.map((file) => (
            <GitFileDiffSurface
              file={{
                ...file,
                binary: false,
                lines: [],
              }}
              key={`${file.status}:${file.oldPath ?? ""}:${file.path}`}
            />
          ))}
        </div>
      ) : (
        <div className="desktop-commit-empty">{t("source-control.commit.noFileChanges")}</div>
      )}
    </div>
  );
}

function GitOverview({
  workspace,
  status,
  loading,
  operationLoading,
  operationError,
  onRefresh,
}: {
  workspace: Workspace;
  status: GitStatusSnapshot | null;
  loading: boolean;
  operationLoading: string | null;
  operationError: string | null;
  onRefresh: () => void;
}) {
  const { t } = useLocalization();
  if (status && isEmptyGitRepository(status)) {
    return (
      <InitialGitRepositoryState
        workspace={workspace}
        status={status}
        loading={loading}
        operationLoading={operationLoading}
        operationError={operationError}
        onRefresh={onRefresh}
      />
    );
  }

  const sourceControl = status?.sourceControl ?? null;
  const groups = sourceControl?.groups ?? [];
  const stagedCount = groups.find((group) => group.id === "index")?.resources.length ?? status?.stagedEntries.length ?? 0;
  const workingCount = (
    (groups.find((group) => group.id === "workingTree")?.resources.length ?? status?.unstagedEntries.length ?? 0) +
    (groups.find((group) => group.id === "untracked")?.resources.length ?? status?.untrackedEntries.length ?? 0)
  );
  const mergeCount = groups.find((group) => group.id === "merge")?.resources.length ?? 0;
  const remote = sourceControl?.remote ?? null;
  const incomingCount = remote?.behind ?? 0;
  const committedCount = remote?.ahead ?? 0;
  const hasChanges = incomingCount + committedCount + stagedCount + workingCount + mergeCount > 0;

  return (
    <section className="desktop-utility-view desktop-history-detail-view">
      <div className="desktop-git-default-state">
        <div className="desktop-git-default-copy">
          <span>{t(hasChanges ? "source-control.overview.selectChange" : "source-control.overview.backup")}</span>
        </div>
        {operationError && (
          <div className="desktop-git-default-status danger">
            {operationError}
          </div>
        )}
      </div>
    </section>
  );
}

function InitialGitRepositoryState({
  workspace,
  status,
  loading,
  operationLoading,
  operationError,
  onRefresh,
}: {
  workspace: Workspace;
  status: GitStatusSnapshot;
  loading: boolean;
  operationLoading: string | null;
  operationError: string | null;
  onRefresh: () => void;
}) {
  const { t, formatNumber } = useLocalization();
  const stagedCount = status.stagedEntries.length;
  const workingCount = status.unstagedEntries.length + status.untrackedEntries.length;
  const branchName = displayGitBranch(status, t("source-control.branch.initial"));
  const readyForCommit = stagedCount > 0;
  const hasWorkingFiles = workingCount > 0;
  const stateLabel = t(readyForCommit
    ? "source-control.initial.ready"
    : hasWorkingFiles ? "source-control.initial.notStaged" : "source-control.initial.clean");
  const stateDetail = readyForCommit
    ? t("source-control.initial.readyDetail")
    : hasWorkingFiles
      ? t("source-control.initial.notStagedDetail")
      : t("source-control.initial.cleanDetail");

  return (
    <section className="desktop-utility-view desktop-history-detail-view">
      <div className="desktop-history-detail-scroll" data-po-scrollbar="content">
        <div className="desktop-initial-repo-state">
          <div className="desktop-initial-repo-card">
            <div className="desktop-initial-repo-header">
              <span className="desktop-initial-repo-icon" aria-hidden>
                <GitBranch size={17} />
              </span>
              <div>
                <span>{t("source-control.initial.initialized")}</span>
                <strong>{stateLabel}</strong>
              </div>
              <button className="desktop-utility-icon-button" type="button" onClick={onRefresh} aria-label={t("source-control.action.refreshGit")}>
                <RefreshCw size={15} className={loading ? "spin" : undefined} />
              </button>
            </div>

            <p>
              {t("source-control.initial.description", { workspace: bidiIsolate(workspace.name), detail: stateDetail })}
            </p>

            <div className="desktop-initial-repo-metrics">
              <div>
                <span>{t("source-control.label.branch")}</span>
                <strong><bdi>{branchName}</bdi></strong>
              </div>
              <div>
                <span>{t("source-control.label.staged")}</span>
                <strong>{formatNumber(stagedCount)}</strong>
              </div>
              <div>
                <span>{t("source-control.label.changes")}</span>
                <strong>{formatNumber(workingCount)}</strong>
              </div>
            </div>

            {operationError && (
              <div className="desktop-initial-repo-status danger">
                {operationError}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function EmptyGitHistoryState({
  status,
  operationError,
  onRefresh,
  loading,
}: {
  status: GitStatusSnapshot | null;
  operationError: string | null;
  onRefresh: () => void;
  loading: boolean;
}) {
  const { t } = useLocalization();
  return (
    <div className="desktop-initial-repo-state desktop-initial-repo-state--compact">
      <div className="desktop-initial-repo-card">
        <div className="desktop-initial-repo-header">
          <span className="desktop-initial-repo-icon" aria-hidden>
            <GitBranch size={17} />
          </span>
          <div>
            <span>{t("source-control.history.title")}</span>
            <strong>{t("source-control.history.noCommitsYet")}</strong>
          </div>
          <button className="desktop-utility-icon-button" type="button" onClick={onRefresh} aria-label={t("source-control.action.refreshGit")}>
            <RefreshCw size={15} className={loading ? "spin" : undefined} />
          </button>
        </div>
        <p>
          {status?.isRepo
            ? t("source-control.history.firstCommit", { branch: bidiIsolate(displayGitBranch(status, t("source-control.branch.initial"))) })
            : t("source-control.history.initialize")}
        </p>
        {operationError && <div className="desktop-initial-repo-status danger">{operationError}</div>}
      </div>
    </div>
  );
}

function UtilityEmptyState({
  icon,
  message,
  detail,
  tone,
  loading,
  onRefresh,
  action,
}: {
  icon?: ReactNode;
  message: string;
  detail?: string;
  tone?: "danger";
  loading?: boolean;
  onRefresh?: () => void;
  action?: ReactNode;
}) {
  const { t } = useLocalization();
  return (
    <section className="desktop-utility-view">
      <div className={`desktop-utility-center ${tone ?? ""}`}>
        {icon}
        <strong>{message}</strong>
        {detail && <span>{detail}</span>}
        {action}
        {onRefresh && (
          <button className="desktop-utility-icon-button" type="button" onClick={onRefresh} aria-label={t("source-control.action.refreshGit")}>
            <RefreshCw size={15} className={loading ? "spin" : undefined} />
          </button>
        )}
      </div>
    </section>
  );
}

function getChangeTotals(changes: Array<{ additions: number | null; deletions: number | null }>) {
  return changes.reduce<{ files: number; additions: number; deletions: number }>(
    (totals, change) => ({
      files: totals.files + 1,
      additions: totals.additions + (change.additions ?? 0),
      deletions: totals.deletions + (change.deletions ?? 0),
    }),
    { files: 0, additions: 0, deletions: 0 },
  );
}

function isEmptyGitRepository(status: GitStatusSnapshot) {
  return status.isRepo && !status.headCommitId && status.totalCommits === 0;
}

function shortCommit(commitId: string) {
  return commitId.slice(0, 8);
}

function formatGitRelativeTime(
  iso: string | null,
  formatDate: (value: Date | number | string, options?: Intl.DateTimeFormatOptions) => string,
  formatRelativeTime: (value: number, unit: Intl.RelativeTimeFormatUnit, options?: Intl.RelativeTimeFormatOptions) => string,
) {
  if (!iso) return "";
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return formatRelativeTime(0, "second", { numeric: "auto" });
  if (minutes < 60) return formatRelativeTime(-minutes, "minute", { numeric: "auto" });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return formatRelativeTime(-hours, "hour", { numeric: "auto" });
  const days = Math.floor(hours / 24);
  if (days < 7) return formatRelativeTime(-days, "day", { numeric: "auto" });
  return formatDate(date, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}

function formatGitFullTime(
  iso: string | null,
  formatDate: (value: Date | number | string, options?: Intl.DateTimeFormatOptions) => string,
) {
  if (!iso) return "";
  return formatDate(iso, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
