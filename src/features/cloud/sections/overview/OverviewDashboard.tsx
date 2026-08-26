import { useLocalization } from "@puppyone/localization/react";
import { FileGlyphIcon } from "@puppyone/shared-ui";
import type {
  DesktopCloudDashboard,
  DesktopCloudTree,
} from "../../../../lib/cloudApi";
import type { DesktopCloudHistory } from "../../../../lib/cloudHistoryApi";
import {
  formatFullTime,
  formatRelativeTime,
} from "../../utils";
import {
  getCloudOverviewEntryUpdatedAt,
  getLatestCloudCommit,
  getCloudOverviewRootEntries,
} from "./overviewMetrics";

export function CloudOverviewDashboard({
  history,
  dashboard,
  tree,
  loading,
}: {
  history: DesktopCloudHistory | null;
  dashboard: DesktopCloudDashboard | null;
  tree: DesktopCloudTree | null;
  loading: boolean;
}) {
  const localization = useLocalization();
  const { t } = localization;
  const entries = getCloudOverviewRootEntries(tree);
  const storedFileCount = dashboard?.nodes.files
    ?? entries.filter((entry) => entry.type !== "folder").length;
  const latestCommit = getLatestCloudCommit(history);
  const latestCommitTime = latestCommit?.created_at
    ? formatRelativeTime(latestCommit.created_at, localization)
    : "—";
  const latestCommitTitle = latestCommit?.created_at
    ? formatFullTime(latestCommit.created_at, localization.formatDate)
    : undefined;
  const authorInitial = latestCommit?.who.trim().charAt(0).toLocaleUpperCase() || "—";

  return (
    <section
      className="desktop-cloud-overview-dashboard"
      aria-label={t("cloud.overview.fileListAria")}
      aria-busy={loading}
    >
      <section className="desktop-cloud-overview-files">
        <div
          className="desktop-cloud-overview-file-table"
          role="table"
          aria-label={`${t("cloud.overview.fileListAria")} · ${t("cloud.history.fileCount", { count: storedFileCount })}`}
          aria-rowcount={entries.length + 1}
        >
          <header className={`desktop-cloud-overview-file-activity-header${latestCommit ? "" : " desktop-cloud-overview-file-activity-header--empty"}`}>
            {latestCommit ? (
              <>
                <span className="desktop-cloud-overview-commit-author-mark" aria-hidden="true">
                  {authorInitial}
                </span>
                <strong className="desktop-cloud-overview-commit-author" dir="auto">
                  {latestCommit.who.trim() || "—"}
                </strong>
                <span className="desktop-cloud-overview-commit-message" dir="auto">
                  {latestCommit.message || t("cloud.history.unknownCommit")}
                </span>
                <time
                  className="desktop-cloud-overview-commit-time"
                  dateTime={latestCommit.created_at ?? undefined}
                  title={latestCommitTitle}
                >
                  {latestCommitTime}
                </time>
              </>
            ) : (
              <>
                <span className="desktop-cloud-overview-commit-message">
                  {t("cloud.history.noCommits")}
                </span>
                <span className="desktop-cloud-overview-commit-time">—</span>
              </>
            )}
          </header>

          <div className="desktop-cloud-overview-file-column-labels desktop-cloud-overview-visually-hidden" role="row">
            <span role="columnheader">{t("cloud.common.name")}</span>
            <span role="columnheader">{t("cloud.status.modified")}</span>
          </div>

          {entries.length > 0 ? entries.map((entry) => {
            const updatedAt = getCloudOverviewEntryUpdatedAt(entry, history);
            return (
              <div
                className="desktop-cloud-overview-file-row"
                role="row"
                title={entry.path}
                key={`${entry.type}:${entry.path}`}
              >
                <span className="desktop-cloud-overview-file-primary" role="cell">
                  <span className="desktop-cloud-overview-file-icon" aria-hidden="true">
                    <FileGlyphIcon name={entry.name} type={entry.type} size={15} />
                  </span>
                  <strong className="desktop-cloud-overview-file-name" dir="auto">{entry.name}</strong>
                </span>
                <span className="desktop-cloud-overview-file-modified" role="cell">
                  {updatedAt ? (
                    <time
                      dateTime={updatedAt}
                      title={formatFullTime(updatedAt, localization.formatDate)}
                    >
                      {formatRelativeTime(updatedAt, localization)}
                    </time>
                  ) : "—"}
                </span>
              </div>
            );
          }) : (
            <div className="desktop-cloud-overview-files-empty">
              {loading ? t("cloud.common.loading") : t("cloud.overview.storageEmpty")}
            </div>
          )}
        </div>
      </section>
    </section>
  );
}
