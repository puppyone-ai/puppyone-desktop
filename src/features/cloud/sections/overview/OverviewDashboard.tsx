import { useLocalization } from "@puppyone/localization/react";
import { FileGlyphIcon } from "@puppyone/shared-ui";
import type {
  DesktopCloudDashboard,
  DesktopCloudTree,
} from "../../../../lib/cloudApi";
import type { DesktopCloudHistory } from "../../../../lib/cloudHistoryApi";
import {
  formatBytes,
  formatFullTime,
  formatRelativeTime,
} from "../../utils";
import {
  getCloudOverviewEntryUpdatedAt,
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
          <div className="desktop-cloud-overview-file-columns" role="row">
            <span role="columnheader">
              <span className="desktop-cloud-overview-visually-hidden">{t("cloud.common.name")}</span>
            </span>
            <span role="columnheader">{t("cloud.status.modified")}</span>
            <span role="columnheader">{t("cloud.overview.fileSize")}</span>
          </div>

          {entries.length > 0 ? entries.map((entry) => {
            const updatedAt = getCloudOverviewEntryUpdatedAt(entry, history);
            const size = entry.type === "folder"
              ? "—"
              : formatBytes(entry.size_bytes, localization) || "—";
            return (
              <div
                className="desktop-cloud-overview-file-row"
                role="row"
                title={entry.path}
                key={`${entry.type}:${entry.path}`}
              >
                <span className="desktop-cloud-overview-file-primary" role="cell">
                  <span className="desktop-cloud-overview-file-icon" aria-hidden="true">
                    <FileGlyphIcon name={entry.name} type={entry.type} size={16} />
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
                <span className="desktop-cloud-overview-file-size" role="cell">{size}</span>
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
