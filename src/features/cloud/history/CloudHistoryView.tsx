import {
  Clock3,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { useLocalization } from "@puppyone/localization/react";
import { PageLoading } from "../../../components/loading";
import { openCloudApp } from "../../../lib/cloudApi";
import { CloudCommitDetail } from "./CloudCommitDetail";
import type { CloudProjectHistoryProps } from "./types";

export function CloudProjectHistoryView({
  projectId,
  projectName,
  history,
  rows,
  selectedCommitId,
  loading,
  error,
  onRefresh,
}: CloudProjectHistoryProps) {
  const { t } = useLocalization();
  const selectedRow = rows.find((row) => row.kind === "commit" && row.id === selectedCommitId) ?? null;
  const selectedCommit = history?.commits.find((commit) => commit.commit_id === selectedRow?.id) ?? null;
  const isHead = Boolean(
    selectedCommit && history?.head_commit_id && selectedCommit.commit_id === history.head_commit_id,
  );

  return (
    <section className="desktop-cloud-project-history-view">
      <header className="desktop-cloud-project-history-header">
        <div className="desktop-cloud-project-history-title">
          <Clock3 size={15} aria-hidden="true" />
          <div>
            <strong>{t("cloud.route.history.title")}</strong>
            <span dir="auto">{projectName}</span>
          </div>
        </div>
        <div className="desktop-cloud-project-history-actions">
          <button
            type="button"
            disabled={loading}
            onClick={() => void onRefresh()}
          >
            <RefreshCw size={13} className={loading ? "spin" : undefined} aria-hidden="true" />
            <span>{t("cloud.common.refresh")}</span>
          </button>
          <button
            type="button"
            disabled={!projectId}
            onClick={() => projectId && openCloudApp(`/projects/${projectId}/changes`)}
          >
            <ExternalLink size={13} aria-hidden="true" />
            <span>{t("cloud.common.openCloud")}</span>
          </button>
        </div>
      </header>

      <div className="desktop-cloud-project-history-body">
        {loading && rows.length === 0 ? (
          <PageLoading variant="fill" label={t("cloud.history.loading")} className="desktop-cloud-project-history-loading" />
        ) : error && rows.length === 0 ? (
          <CloudProjectHistoryEmpty
            title={t("cloud.history.unavailable")}
            detail={error}
            onRefresh={onRefresh}
          />
        ) : rows.length === 0 ? (
          <CloudProjectHistoryEmpty
            title={t("cloud.history.noCommits")}
            detail={t("cloud.history.noCommitsDetail")}
            onRefresh={onRefresh}
          />
        ) : selectedCommit && selectedRow ? (
          <CloudCommitDetail
            projectId={projectId}
            commit={selectedCommit}
            row={selectedRow}
            isHead={isHead}
          />
        ) : (
          <CloudProjectHistoryEmpty
            title={t("cloud.history.selectCommit")}
            detail={t("cloud.history.selectCommitDetail")}
          />
        )}
      </div>
    </section>
  );
}

function CloudProjectHistoryEmpty({
  title,
  detail,
  onRefresh,
}: {
  title: string;
  detail: string;
  onRefresh?: () => void | Promise<void>;
}) {
  const { t } = useLocalization();
  return (
    <div className="desktop-cloud-project-history-empty">
      <span><Clock3 size={26} aria-hidden="true" /></span>
      <strong>{title}</strong>
      <p>{detail}</p>
      {onRefresh && (
        <button type="button" onClick={() => void onRefresh()}>
          <RefreshCw size={13} aria-hidden="true" />
          <span>{t("cloud.common.tryAgain")}</span>
        </button>
      )}
    </div>
  );
}
