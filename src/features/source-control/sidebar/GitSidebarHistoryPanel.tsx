import { Clock3, GitBranch } from "lucide-react";
import { VirtualSidebarList } from "@puppyone/shared-ui";
import { bidiIsolate, useLocalization } from "@puppyone/localization";
import type { GitCommitSummary, GitStatusSnapshot } from "../../../types/electron";
import { displayGitBranch } from "../viewModel";

export function GitSidebarHistoryPanel({
  commits,
  selectedCommitId,
  status,
  onSelectCommit,
}: {
  commits: GitCommitSummary[];
  selectedCommitId: string | null;
  status: GitStatusSnapshot | null;
  onSelectCommit: (commitId: string) => void;
}) {
  const { t, formatNumber } = useLocalization();

  return (
    <section className="desktop-git-history-drawer">
      <div className="desktop-git-history-drawer-header">
        <Clock3 size={13} />
        <span>{t("source-control.history.title")}</span>
        <small>{formatNumber(commits.length || status?.totalCommits || 0)}</small>
      </div>

      {commits.length > 0 ? (
        <VirtualSidebarList
          className="desktop-history-list desktop-history-virtual-list"
          ariaLabel={t("source-control.history.ariaLabel")}
          items={commits}
          rowSize={32}
          activeIndex={commits.findIndex((commit) => commit.commit_id === selectedCommitId)}
          getKey={(commit) => commit.commit_id}
          renderRow={(commit, index) => (
            <SidebarHistoryRow
              commit={commit}
              isHead={commit.commit_id === status?.headCommitId}
              isSelected={commit.commit_id === selectedCommitId}
              hasPrevious={index > 0}
              hasNext={index < commits.length - 1}
              onClick={() => onSelectCommit(commit.commit_id)}
            />
          )}
        />
      ) : (
        <SidebarEmptyHistory status={status} />
      )}
    </section>
  );
}

function SidebarHistoryRow({
  commit,
  isHead,
  isSelected,
  hasPrevious,
  hasNext,
  onClick,
}: {
  commit: GitCommitSummary;
  isHead: boolean;
  isSelected: boolean;
  hasPrevious: boolean;
  hasNext: boolean;
  onClick: () => void;
}) {
  const { t, formatNumber } = useLocalization();
  const totals = getChangeTotals(commit.changes);

  return (
    <button
      className={`desktop-history-row ${isSelected ? "active" : ""}`}
      type="button"
      onClick={onClick}
      title={commit.message}
    >
      <span className="desktop-history-graph" aria-hidden="true" dir="ltr">
        {hasPrevious && <i className="before" />}
        {hasNext && <i className="after" />}
        <i className="dot" />
      </span>
      <span className="desktop-history-row-main">
        <span className="desktop-history-row-title">
          {isHead && <span className="desktop-head-badge">HEAD</span>}
          <bdi className="desktop-history-row-message">
            {commit.message || t("source-control.commit.noMessage")}
          </bdi>
        </span>
        <span className="desktop-history-row-stat">
          <span className="added">+{formatNumber(totals.additions)}</span>
          <span className="deleted">-{formatNumber(totals.deletions)}</span>
        </span>
      </span>
    </button>
  );
}

function SidebarEmptyHistory({ status }: { status: GitStatusSnapshot | null }) {
  const { t } = useLocalization();
  return (
    <div className="desktop-git-sidebar-empty-history">
      <GitBranch size={14} />
      <div>
        <strong>{t("source-control.history.noCommits")}</strong>
        <span>{status?.isRepo
          ? t("source-control.history.branchEmpty", { branch: bidiIsolate(displayGitBranch(status, t("source-control.branch.initial"))) })
          : t("source-control.history.notInitialized")}</span>
      </div>
    </div>
  );
}

function getChangeTotals(changes: Array<{ additions: number | null; deletions: number | null }>) {
  return changes.reduce<{ additions: number; deletions: number }>(
    (totals, change) => ({
      additions: totals.additions + (change.additions ?? 0),
      deletions: totals.deletions + (change.deletions ?? 0),
    }),
    { additions: 0, deletions: 0 },
  );
}
