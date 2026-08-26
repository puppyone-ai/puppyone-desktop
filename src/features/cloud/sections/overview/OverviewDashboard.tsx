import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { useState } from "react";
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
  getCloudOverviewRootEntries,
} from "./overviewMetrics";

type OverviewFileFilter = "all" | "folder" | "file";
type OverviewModifiedFilter = "all" | "day" | "week" | "month";
type OverviewFileSortKey = "name" | "modified";
type OverviewFileSortDirection = "asc" | "desc";

const MODIFIED_FILTER_WINDOWS: Record<Exclude<OverviewModifiedFilter, "all">, number> = {
  day: 86_400_000,
  week: 7 * 86_400_000,
  month: 30 * 86_400_000,
};

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
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<OverviewFileFilter>("all");
  const [modifiedFilter, setModifiedFilter] = useState<OverviewModifiedFilter>("all");
  const [sortKey, setSortKey] = useState<OverviewFileSortKey>("name");
  const [sortDirection, setSortDirection] = useState<OverviewFileSortDirection>("asc");
  const entries = getCloudOverviewRootEntries(tree);
  const storedFileCount = dashboard?.nodes.files
    ?? entries.filter((entry) => entry.type !== "folder").length;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleEntries = entries
    .map((entry) => {
      const updatedAt = getCloudOverviewEntryUpdatedAt(entry, history);
      return {
        entry,
        updatedAt,
        updatedTimestamp: updatedAt ? Date.parse(updatedAt) : null,
      };
    })
    .filter(({ entry, updatedTimestamp }) => {
      const matchesName = !normalizedQuery || entry.name.toLocaleLowerCase().includes(normalizedQuery);
      const matchesType = typeFilter === "all"
        || (typeFilter === "folder" ? entry.type === "folder" : entry.type !== "folder");
      const modifiedWindow = modifiedFilter === "all"
        ? null
        : MODIFIED_FILTER_WINDOWS[modifiedFilter];
      const matchesModified = modifiedWindow === null
        || (updatedTimestamp !== null && updatedTimestamp >= Date.now() - modifiedWindow);
      return matchesName && matchesType && matchesModified;
    })
    .sort((left, right) => compareOverviewEntries(left, right, sortKey, sortDirection));
  const noMatches = entries.length > 0 && visibleEntries.length === 0;

  const changeSort = (nextSortKey: OverviewFileSortKey) => {
    if (nextSortKey === sortKey) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(nextSortKey);
    setSortDirection(nextSortKey === "modified" ? "desc" : "asc");
  };

  return (
    <section
      className="desktop-cloud-overview-dashboard"
      aria-label={t("cloud.overview.fileListAria")}
      aria-busy={loading}
    >
      {entries.length > 0 ? (
        <div className="desktop-cloud-overview-file-toolbar">
          <label className="desktop-cloud-overview-file-search">
            <Search size={13} aria-hidden="true" />
            <input
              value={query}
              aria-label={t("cloud.overview.filterByName")}
              placeholder={t("cloud.overview.filterByName")}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <select
            className="desktop-cloud-overview-file-type-filter"
            value={typeFilter}
            aria-label={t("cloud.overview.fileType")}
            onChange={(event) => setTypeFilter(event.target.value as OverviewFileFilter)}
          >
            <option value="all">{t("cloud.common.all")}</option>
            <option value="folder">{t("cloud.overview.filterFolders")}</option>
            <option value="file">{t("cloud.overview.filterFiles")}</option>
          </select>
          <select
            className="desktop-cloud-overview-file-modified-filter"
            value={modifiedFilter}
            aria-label={t("cloud.status.modified")}
            onChange={(event) => setModifiedFilter(event.target.value as OverviewModifiedFilter)}
          >
            <option value="all">{t("cloud.overview.modifiedAnytime")}</option>
            <option value="day">{t("cloud.overview.modifiedDay")}</option>
            <option value="week">{t("cloud.overview.modifiedWeek")}</option>
            <option value="month">{t("cloud.overview.modifiedMonth")}</option>
          </select>
        </div>
      ) : null}

      <section className="desktop-cloud-overview-files">
        <div
          className="desktop-cloud-overview-file-table"
          role="table"
          aria-label={`${t("cloud.overview.fileListAria")} · ${t("cloud.history.fileCount", { count: storedFileCount })}`}
          aria-rowcount={visibleEntries.length + 1}
        >
          <div className="desktop-cloud-overview-file-column-labels" role="row">
            <span role="columnheader" aria-sort={sortKey === "name" ? sortDirectionToAria(sortDirection) : "none"}>
              <button type="button" onClick={() => changeSort("name")}>
                {t("cloud.common.name")}
                {sortKey === "name" ? <SortIcon direction={sortDirection} /> : null}
              </button>
            </span>
            <span role="columnheader" aria-sort={sortKey === "modified" ? sortDirectionToAria(sortDirection) : "none"}>
              <button type="button" onClick={() => changeSort("modified")}>
                {t("cloud.status.modified")}
                {sortKey === "modified" ? <SortIcon direction={sortDirection} /> : null}
              </button>
            </span>
          </div>

          {visibleEntries.length > 0 ? visibleEntries.map(({ entry, updatedAt }) => {
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
              {loading
                ? t("cloud.common.loading")
                : noMatches
                  ? t("cloud.overview.noMatchingFiles")
                  : t("cloud.overview.storageEmpty")}
            </div>
          )}
        </div>
      </section>
    </section>
  );
}

function SortIcon({ direction }: { direction: OverviewFileSortDirection }) {
  const Icon = direction === "asc" ? ArrowUp : ArrowDown;
  return <Icon size={12} strokeWidth={1.8} aria-hidden="true" />;
}

function sortDirectionToAria(direction: OverviewFileSortDirection) {
  return direction === "asc" ? "ascending" : "descending";
}

function compareOverviewEntries(
  left: { entry: DesktopCloudTree["entries"][number]; updatedTimestamp: number | null },
  right: { entry: DesktopCloudTree["entries"][number]; updatedTimestamp: number | null },
  sortKey: OverviewFileSortKey,
  sortDirection: OverviewFileSortDirection,
) {
  const direction = sortDirection === "asc" ? 1 : -1;
  if (sortKey === "name") {
    const folderOrder = Number(right.entry.type === "folder") - Number(left.entry.type === "folder");
    return folderOrder || left.entry.name.localeCompare(right.entry.name) * direction;
  }
  if (left.updatedTimestamp === null && right.updatedTimestamp !== null) return 1;
  if (left.updatedTimestamp !== null && right.updatedTimestamp === null) return -1;
  const timestampOrder = (left.updatedTimestamp ?? 0) - (right.updatedTimestamp ?? 0);
  return timestampOrder * direction || left.entry.name.localeCompare(right.entry.name);
}
