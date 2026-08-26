import { ArrowRight } from "lucide-react";
import { useLocalization } from "@puppyone/localization/react";
import { FileGlyphIcon } from "@puppyone/shared-ui";
import type {
  DesktopCloudDashboard,
  DesktopCloudTree,
  DesktopCloudTreeEntry,
} from "../../../../lib/cloudApi";
import type { DesktopCloudHistory } from "../../../../lib/cloudHistoryApi";
import { getCloudRoute, type CloudRouteIcon } from "../../routes/cloudRoutes";
import type { CloudWorkspaceSection } from "../../types";
import {
  formatCloudTreeEntryDetail,
  formatFullTime,
  formatRelativeTime,
} from "../../utils";
import {
  getCloudOverviewRootEntries,
  getLatestCloudUpdateAt,
} from "./overviewMetrics";

const FILE_LIST_LIMIT = 9;

export function CloudOverviewDashboard({
  projectUpdatedAt,
  history,
  dashboard,
  tree,
  accessPointCount,
  loading,
  onSelectSection,
}: {
  projectUpdatedAt: string | null;
  history: DesktopCloudHistory | null;
  dashboard: DesktopCloudDashboard | null;
  tree: DesktopCloudTree | null;
  accessPointCount: number;
  loading: boolean;
  onSelectSection: (section: CloudWorkspaceSection) => void;
}) {
  const localization = useLocalization();
  const { formatNumber, t } = localization;
  const entries = getCloudOverviewRootEntries(tree);
  const visibleEntries = entries.slice(0, FILE_LIST_LIMIT);
  const storedFileCount = dashboard?.nodes.files
    ?? entries.filter((entry) => entry.type !== "folder").length;
  const lastUpdatedAt = getLatestCloudUpdateAt(projectUpdatedAt, history);
  const HistoryIcon = getCloudRoute("history").icon;
  const AccessIcon = getCloudRoute("access").icon;

  return (
    <section
      className="desktop-cloud-overview-dashboard"
      aria-label={t("cloud.overview.actionsAria")}
      aria-busy={loading}
    >
      <section className="desktop-cloud-overview-files" aria-labelledby="cloud-overview-files-title">
        <header className="desktop-cloud-overview-files-header">
          <span className="desktop-cloud-overview-files-heading">
            <h2 id="cloud-overview-files-title">{t("cloud.overview.filesLabel")}</h2>
          </span>
          <span className="desktop-cloud-overview-files-count" aria-live="polite">
            {t("cloud.history.fileCount", { count: storedFileCount })}
          </span>
        </header>

        <div
          className="desktop-cloud-overview-file-list"
          aria-label={t("cloud.overview.fileListAria")}
        >
          {visibleEntries.map((entry) => (
            <OverviewFileRow entry={entry} key={`${entry.type}:${entry.path}`} />
          ))}
          {visibleEntries.length === 0 ? (
            <span className="desktop-cloud-overview-files-empty">
              {loading ? t("cloud.common.loading") : t("cloud.overview.storageEmpty")}
            </span>
          ) : null}
          {entries.length > FILE_LIST_LIMIT ? (
            <span className="desktop-cloud-overview-file-more">
              {t("cloud.overview.moreItems", { count: entries.length - FILE_LIST_LIMIT })}
            </span>
          ) : null}
        </div>
      </section>

      <section className="desktop-cloud-overview-summary-grid">
        <OverviewSummaryCard
          icon={HistoryIcon}
          label={t("cloud.route.history.title")}
          value={lastUpdatedAt ? formatRelativeTime(lastUpdatedAt, localization) : "—"}
          valueTitle={lastUpdatedAt
            ? formatFullTime(lastUpdatedAt, localization.formatDate)
            : undefined}
          ariaLabel={t("cloud.overview.viewHistory")}
          onClick={() => onSelectSection("history")}
        />
        <OverviewSummaryCard
          icon={AccessIcon}
          label={t("cloud.access.resources")}
          value={formatNumber(accessPointCount)}
          ariaLabel={t("cloud.overview.manageAccessPoints")}
          onClick={() => onSelectSection("access")}
        />
      </section>
    </section>
  );
}

function OverviewFileRow({ entry }: { entry: DesktopCloudTreeEntry }) {
  const localization = useLocalization();

  return (
    <span className="desktop-cloud-overview-file-row" title={entry.path}>
      <span className="desktop-cloud-overview-file-icon" aria-hidden="true">
        <FileGlyphIcon name={entry.name} type={entry.type} size={18} />
      </span>
      <strong className="desktop-cloud-overview-file-name" dir="auto">{entry.name}</strong>
      <small className="desktop-cloud-overview-file-detail">
        {formatCloudTreeEntryDetail(entry, localization)}
      </small>
    </span>
  );
}

function OverviewSummaryCard({
  icon: Icon,
  label,
  value,
  valueTitle,
  ariaLabel,
  onClick,
}: {
  icon: CloudRouteIcon;
  label: string;
  value: string;
  valueTitle?: string;
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      className="desktop-cloud-overview-summary-card"
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
    >
      <span className="desktop-cloud-overview-summary-icon" aria-hidden="true">
        <Icon size={16} />
      </span>
      <span className="desktop-cloud-overview-summary-copy">
        <small className="desktop-cloud-overview-summary-label">{label}</small>
        <strong title={valueTitle}>{value}</strong>
      </span>
      <ArrowRight className="po-directional-icon" size={14} aria-hidden="true" />
    </button>
  );
}
