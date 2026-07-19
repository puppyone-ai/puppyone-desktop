import {
  ArrowRight,
  Clock3,
  Database,
  Grid2X2,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { useLocalization } from "@puppyone/localization/react";
import type {
  DesktopCloudDashboard,
} from "../../../../lib/cloudApi";
import type { DesktopCloudHistory } from "../../../../lib/cloudHistoryApi";
import type { CloudAutomationRow } from "../../../automation/automationDomain";
import { formatCloudAccessSurfaceTitle } from "../../cloudPresentation";
import type { CloudWorkspaceSection } from "../../types";
import {
  formatProviderLabel,
  getCloudProviderIconUrl,
  getScopePathLabel,
  isConnectorActiveStatus,
} from "../../utils";
import type { CloudAccessSurfaceRow } from "../access/accessRows";
import { CloudOverviewHistoryPreview } from "./OverviewHistoryPreview";
import {
  CLOUD_OVERVIEW_ACTIVITY_WINDOW_DAYS,
  getRecentCloudCommitActivity,
} from "./overviewMetrics";

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
  const activeAccessCount = accessRows.filter((row) => isConnectorActiveStatus(row.surface.status)).length;
  const visibleAccessRows = accessRows.slice(0, 5);
  const hiddenAccessCount = Math.max(0, accessRows.length - visibleAccessRows.length);
  const activeAutomationRows = automationRows.filter((row) => isConnectorActiveStatus(row.connector.status));
  const storedFileCount = dashboard?.nodes.files ?? null;

  return (
    <section
      className="desktop-cloud-overview-dashboard"
      aria-label={t("cloud.overview.actionsAria")}
      aria-busy={loading}
    >
      <button
        className="desktop-cloud-overview-dashboard-card desktop-cloud-overview-dashboard-card--history desktop-cloud-overview-dashboard-card--interactive"
        type="button"
        aria-label={t("cloud.overview.viewHistory")}
        onClick={() => onSelectSection("history")}
      >
        <DashboardCardHeader
          icon={<Clock3 size={16} />}
          title={t("cloud.route.history.title")}
          interactive
        />
        <span className="desktop-cloud-overview-dashboard-hero desktop-cloud-overview-dashboard-hero--metric">
          <strong>{formatNumber(recentCommitActivity.count)}{recentCommitActivity.isLowerBound ? "+" : ""}</strong>
          <small>{t("cloud.overview.commitWindow", {
            count: recentCommitActivity.count,
            days: CLOUD_OVERVIEW_ACTIVITY_WINDOW_DAYS,
          })}</small>
        </span>
        {history?.commits.length ? (
          <CloudOverviewHistoryPreview history={history} />
        ) : (
          <span className="desktop-cloud-overview-dashboard-empty">{t("cloud.history.noCommitsDetail")}</span>
        )}
      </button>

      <button
        className="desktop-cloud-overview-dashboard-card desktop-cloud-overview-dashboard-card--access desktop-cloud-overview-dashboard-card--interactive"
        type="button"
        aria-label={t("cloud.overview.manageAccessPoints")}
        onClick={() => onSelectSection("access")}
      >
        <DashboardCardHeader
          icon={<ShieldCheck size={16} />}
          title={t("cloud.access.resources")}
          interactive
        />
        <span className="desktop-cloud-overview-dashboard-hero desktop-cloud-overview-dashboard-hero--metric">
          <strong>{formatNumber(accessRows.length)}</strong>
          <small>{formatNumber(activeAccessCount)} {t("cloud.access.filterState.active")}</small>
        </span>
        <span className="desktop-cloud-overview-access-list">
          {visibleAccessRows.length > 0 ? visibleAccessRows.map((row) => {
            const active = isConnectorActiveStatus(row.surface.status);
            return (
              <span className="desktop-cloud-overview-access-row" key={row.id}>
                <span className="desktop-cloud-overview-access-copy">
                  <strong>{formatCloudAccessSurfaceTitle(row.surface, t)}</strong>
                  <small dir="auto">{getScopePathLabel(row.scope)}</small>
                </span>
                <span className={`desktop-cloud-overview-access-state${active ? " desktop-cloud-overview-access-state--active" : ""}`}>
                  <i aria-hidden="true" />
                  <span>{t(active ? "cloud.access.filterState.active" : "cloud.access.filterState.inactive")}</span>
                </span>
              </span>
            );
          }) : (
            <span className="desktop-cloud-overview-dashboard-empty">{t("cloud.access.noConnectors")}</span>
          )}
          {hiddenAccessCount > 0 ? (
            <span className="desktop-cloud-overview-access-more">+{formatNumber(hiddenAccessCount)}</span>
          ) : null}
        </span>
      </button>

      <div className="desktop-cloud-overview-dashboard-side-stack">
        <button
          className="desktop-cloud-overview-dashboard-card desktop-cloud-overview-dashboard-card--automation desktop-cloud-overview-dashboard-card--interactive desktop-cloud-overview-dashboard-card--compact"
          type="button"
          aria-label={t("cloud.overview.manageAutomations")}
          onClick={() => onSelectSection("automation")}
        >
          <DashboardCardHeader
            icon={<Grid2X2 size={16} />}
            title={t("cloud.route.automation.title")}
            interactive
          />
          <span className="desktop-cloud-overview-dashboard-hero desktop-cloud-overview-dashboard-hero--metric">
            <strong>{formatNumber(activeAutomationRows.length)}</strong>
            <small>{t("cloud.overview.activeAutomationUnit", { count: activeAutomationRows.length })}</small>
          </span>
          {automationRows.length > 0 ? (
            <span className="desktop-cloud-overview-automation-footer">
              <span className="desktop-cloud-automation-icons" aria-hidden="true">
                {uniqueAutomationProviders(automationRows).map((provider) => (
                  <ProviderMark key={provider} provider={provider} />
                ))}
              </span>
              <small>{formatNumber(automationRows.length)} {t("cloud.overview.serviceUnit", { count: automationRows.length })}</small>
            </span>
          ) : null}
        </button>

        <article className="desktop-cloud-overview-dashboard-card desktop-cloud-overview-dashboard-card--storage desktop-cloud-overview-dashboard-card--compact">
          <DashboardCardHeader
            icon={<Database size={16} />}
            title={t("cloud.billing.storageUsage")}
          />
          <span className="desktop-cloud-overview-storage-value">
            <strong>{storedFileCount === null ? "—" : formatNumber(storedFileCount)}</strong>
            <small>{storedFileCount === null
              ? loading
                ? t("cloud.common.loading")
                : t("cloud.common.missing")
              : t("cloud.history.fileCount", { count: storedFileCount })}</small>
          </span>
        </article>
      </div>
    </section>
  );
}

function DashboardCardHeader({
  icon,
  title,
  interactive = false,
}: {
  icon: ReactNode;
  title: string;
  interactive?: boolean;
}) {
  return (
    <span className="desktop-cloud-overview-dashboard-card-header">
      <span><i aria-hidden="true">{icon}</i><strong>{title}</strong></span>
      {interactive ? <ArrowRight className="po-directional-icon" size={15} aria-hidden="true" /> : null}
    </span>
  );
}

function ProviderMark({ provider }: { provider: string }) {
  const { t } = useLocalization();
  const iconUrl = getCloudProviderIconUrl(provider);
  const label = formatProviderLabel(provider, t);
  const fallback = label[0]?.toUpperCase() || "·";
  return (
    <span className="desktop-cloud-provider-tile" aria-hidden="true">
      {iconUrl ? <img src={iconUrl} alt="" draggable={false} /> : <span>{fallback}</span>}
    </span>
  );
}

function uniqueAutomationProviders(rows: CloudAutomationRow[]) {
  return [...new Set(rows.map((row) => row.connector.provider))].slice(0, 5);
}
