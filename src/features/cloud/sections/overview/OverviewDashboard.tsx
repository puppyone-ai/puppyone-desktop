import {
  ArrowRight,
  File,
  Folder,
} from "lucide-react";
import { useLocalization } from "@puppyone/localization/react";
import type {
  DesktopCloudDashboard,
} from "../../../../lib/cloudApi";
import type { DesktopCloudHistory } from "../../../../lib/cloudHistoryApi";
import type { CloudAutomationRow } from "../../../automation/automationDomain";
import type { CloudWorkspaceSection } from "../../types";
import { isConnectorActiveStatus } from "../../utils";
import type { CloudAccessSurfaceRow } from "../access/accessRows";
import {
  CLOUD_OVERVIEW_ACTIVITY_WINDOW_DAYS,
  getRecentCloudCommitActivity,
} from "./overviewMetrics";

const STORAGE_PREVIEW_LIMIT = 8;

export function CloudOverviewDashboard({
  history,
  dashboard,
  accessRows,
  automationRows,
  loading,
  onSelectSection,
}: {
  history: DesktopCloudHistory | null;
  dashboard: DesktopCloudDashboard | null;
  accessRows: CloudAccessSurfaceRow[];
  automationRows: CloudAutomationRow[];
  loading: boolean;
  onSelectSection: (section: CloudWorkspaceSection) => void;
}) {
  const localization = useLocalization();
  const { formatNumber, t } = localization;
  const recentCommitActivity = getRecentCloudCommitActivity(history);
  const activeAutomationRows = automationRows.filter((row) => isConnectorActiveStatus(row.connector.status));
  const storedFileCount = dashboard?.nodes.files ?? null;
  const storedFolderCount = dashboard?.nodes.folders ?? null;
  const storedTotalCount = dashboard?.nodes.total ?? null;
  const storagePreview = getStoragePreview(storedFolderCount, storedFileCount, storedTotalCount);

  return (
    <section
      className="desktop-cloud-overview-dashboard"
      aria-label={t("cloud.overview.actionsAria")}
      aria-busy={loading}
    >
      <article className="desktop-cloud-overview-dashboard-card desktop-cloud-overview-dashboard-card--storage">
        <span className="desktop-cloud-overview-storage-tab">
          <Folder size={14} aria-hidden="true" />
          <span>{t("cloud.overview.storedLabel")}</span>
        </span>
        <span className="desktop-cloud-overview-storage-body">
          <strong className="desktop-cloud-overview-storage-metric" aria-live="polite">
            {storedFileCount === null
              ? loading
                ? t("cloud.common.loading")
                : t("cloud.common.missing")
              : storedFileCount > 0
                ? t("cloud.history.fileCount", { count: storedFileCount })
                : t("cloud.overview.storageEmpty")}
          </strong>

          <span className="desktop-cloud-overview-storage-preview" aria-hidden="true">
            {storagePreview.items.map((item) => (
              <span
                className={item.kind === "folder"
                  ? "desktop-cloud-overview-storage-preview-item desktop-cloud-overview-storage-preview-item--folder"
                  : "desktop-cloud-overview-storage-preview-item"}
                key={item.id}
              >
                {item.kind === "folder" ? <Folder size={22} /> : <File size={20} />}
              </span>
            ))}
            {storagePreview.hiddenCount > 0 ? (
              <span className="desktop-cloud-overview-storage-preview-more">
                +{formatNumber(storagePreview.hiddenCount)}
              </span>
            ) : null}
          </span>

          <span className="desktop-cloud-overview-storage-stats">
            <span className="desktop-cloud-overview-storage-stat">
              <strong>{formatNumber(storedFolderCount ?? 0)}</strong>
              <small>{t("cloud.overview.folderUnit", { count: storedFolderCount ?? 0 })}</small>
            </span>
            <span className="desktop-cloud-overview-storage-stat">
              <strong>{formatNumber(storedTotalCount ?? 0)}</strong>
              <small>{t("cloud.overview.itemUnit", { count: storedTotalCount ?? 0 })}</small>
            </span>
          </span>
        </span>
      </article>

      <button
        className="desktop-cloud-overview-dashboard-card desktop-cloud-overview-dashboard-card--history desktop-cloud-overview-dashboard-card--interactive"
        type="button"
        aria-label={t("cloud.overview.viewHistory")}
        onClick={() => onSelectSection("history")}
      >
        <DashboardCardHeader
          title={t("cloud.route.history.title")}
        />
        <span className="desktop-cloud-overview-dashboard-hero desktop-cloud-overview-dashboard-hero--metric">
          <strong>{formatNumber(recentCommitActivity.count)}{recentCommitActivity.isLowerBound ? "+" : ""}</strong>
          <small>{t("cloud.overview.commitWindow", {
            count: recentCommitActivity.count,
            days: CLOUD_OVERVIEW_ACTIVITY_WINDOW_DAYS,
          })}</small>
        </span>
      </button>

      <button
        className="desktop-cloud-overview-dashboard-card desktop-cloud-overview-dashboard-card--access desktop-cloud-overview-dashboard-card--interactive"
        type="button"
        aria-label={t("cloud.overview.manageAccessPoints")}
        onClick={() => onSelectSection("access")}
      >
        <DashboardCardHeader
          title={t("cloud.access.resources")}
        />
        <span className="desktop-cloud-overview-dashboard-hero desktop-cloud-overview-dashboard-hero--metric">
          <strong>{formatNumber(accessRows.length)}</strong>
          <small>{t("cloud.overview.accessPointUnit", { count: accessRows.length })}</small>
        </span>
      </button>

      <button
        className="desktop-cloud-overview-dashboard-card desktop-cloud-overview-dashboard-card--automation desktop-cloud-overview-dashboard-card--interactive"
        type="button"
        aria-label={t("cloud.overview.manageAutomations")}
        onClick={() => onSelectSection("automation")}
      >
        <DashboardCardHeader
          title={t("cloud.route.automation.title")}
        />
        <span className="desktop-cloud-overview-dashboard-hero desktop-cloud-overview-dashboard-hero--metric">
          <strong>{formatNumber(activeAutomationRows.length)}</strong>
          <small>{t("cloud.overview.activeAutomationUnit", { count: activeAutomationRows.length })}</small>
        </span>
      </button>
    </section>
  );
}

function DashboardCardHeader({
  title,
}: {
  title: string;
}) {
  return (
    <span className="desktop-cloud-overview-dashboard-card-header">
      <strong>{title}</strong>
      <ArrowRight className="po-directional-icon" size={14} aria-hidden="true" />
    </span>
  );
}

function getStoragePreview(
  folderCount: number | null,
  fileCount: number | null,
  totalCount: number | null,
) {
  const visibleFolderCount = Math.min(folderCount ?? 0, STORAGE_PREVIEW_LIMIT);
  const visibleFileCount = Math.min(
    fileCount ?? 0,
    STORAGE_PREVIEW_LIMIT - visibleFolderCount,
  );
  const items = [
    ...Array.from({ length: visibleFolderCount }, (_, index) => ({
      id: `folder-${index}`,
      kind: "folder" as const,
    })),
    ...Array.from({ length: visibleFileCount }, (_, index) => ({
      id: `file-${index}`,
      kind: "file" as const,
    })),
  ];

  return {
    items,
    hiddenCount: Math.max(0, (totalCount ?? items.length) - items.length),
  };
}
