import {
  Check,
  Copy,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import type { Workspace } from "@puppyone/shared-ui";
import { useLocalization } from "@puppyone/localization/react";
import "./overview.css";
import type {
  DesktopCloudConnector,
  DesktopCloudDashboard,
  DesktopCloudMcpEndpoint,
  DesktopCloudProject,
  DesktopCloudRepoIdentity,
  DesktopCloudScope,
  DesktopCloudTree,
} from "../../../../lib/cloudApi";
import type { DesktopCloudHistory } from "../../../../lib/cloudHistoryApi";
import { CloudWorkspaceLoadingState } from "../../components/shared";
import { getCloudRoute } from "../../routes/cloudRoutes";
import type { CloudWorkspaceSection } from "../../types";
import {
  copyText,
  formatBytes,
  formatFullTime,
  formatRelativeTime,
} from "../../utils";
import { CloudOverviewDashboard } from "./OverviewDashboard";
import {
  getCloudOverviewMetrics,
  getCloudOverviewStorageUsage,
  getLatestCloudUpdateAt,
  type CloudOverviewStorageUsage,
} from "./overviewMetrics";

export function CloudRepositoryOverview({
  workspace,
  project,
  dashboard,
  tree,
  history,
  scopes,
  connectors,
  mcpEndpoints,
  identity,
  loading,
  onSelectSection,
  onRefresh,
}: {
  workspace: Workspace;
  project: DesktopCloudProject | null;
  dashboard: DesktopCloudDashboard | null;
  tree: DesktopCloudTree | null;
  history: DesktopCloudHistory | null;
  scopes: DesktopCloudScope[];
  connectors: DesktopCloudConnector[];
  mcpEndpoints: DesktopCloudMcpEndpoint[];
  identity: DesktopCloudRepoIdentity | null;
  loading: boolean;
  onSelectSection: (section: CloudWorkspaceSection) => void;
  onRefresh: () => Promise<void>;
}) {
  const localization = useLocalization();
  const { formatNumber, t } = localization;
  const projectName = project?.name ?? workspace.name;
  const projectDescription = project?.description?.trim() || null;
  const gitRemoteUrl = identity?.url?.trim() || null;
  const overviewMetrics = getCloudOverviewMetrics({
    scopes,
    connectors,
    mcpEndpoints,
    identity,
  });
  const storageUsage = getCloudOverviewStorageUsage(dashboard, tree);
  const latestUpdateAt = getLatestCloudUpdateAt(project?.updated_at ?? null, history);
  const latestUpdate = latestUpdateAt
    ? formatRelativeTime(latestUpdateAt, localization)
    : "—";
  const SettingsIcon = getCloudRoute("settings").icon;
  const hasOverviewData = Boolean(
    dashboard
    || tree
    || history
    || identity
    || scopes.length > 0
    || connectors.length > 0
    || mcpEndpoints.length > 0,
  );
  if (loading && !hasOverviewData) {
    return <CloudWorkspaceLoadingState label={t("cloud.loading.project")} />;
  }

  return (
    <section className="desktop-cloud-overview-page" aria-label={t("cloud.overview.ariaLabel")}>
      <main className="desktop-cloud-overview-canvas" data-po-scrollbar="content">
        <div className="desktop-cloud-overview-catalog">
          <header className="desktop-cloud-overview-landing-header">
            <div className="desktop-cloud-overview-landing-copy">
              <h1 dir="auto">{projectName}</h1>
              {gitRemoteUrl
                ? <CloudOverviewGitRemote value={gitRemoteUrl} />
                : projectDescription
                  ? <p dir="auto">{projectDescription}</p>
                  : null}
            </div>

            <div className="desktop-cloud-overview-header-side">
              <div className="desktop-cloud-overview-header-facts">
                <CloudOverviewHeaderFact
                  label={t("cloud.overview.lastUpdated")}
                  value={latestUpdate}
                  valueTitle={latestUpdateAt
                    ? formatFullTime(latestUpdateAt, localization.formatDate)
                    : undefined}
                  ariaLabel={t("cloud.overview.viewHistory")}
                  onClick={() => onSelectSection("history")}
                />
                <CloudOverviewStorageMeter usage={storageUsage} loading={loading} />
                <CloudOverviewHeaderFact
                  label={t("cloud.access.resources")}
                  value={formatNumber(overviewMetrics.accessPointCount)}
                  ariaLabel={t("cloud.overview.manageAccessPoints")}
                  onClick={() => onSelectSection("access")}
                />
              </div>

              <div className="desktop-cloud-overview-header-actions">
                {project?.capabilities?.includes("project.settings.manage") === true && (
                  <button
                    className="desktop-cloud-overview-settings-button"
                    type="button"
                    aria-label={t("cloud.route.settings.title")}
                    title={t("cloud.route.settings.title")}
                    onClick={() => onSelectSection("settings")}
                  >
                    <SettingsIcon size={14} />
                  </button>
                )}
                <button
                  className="desktop-cloud-overview-refresh-button"
                  type="button"
                  aria-label={t("cloud.common.refresh")}
                  title={t("cloud.common.refresh")}
                  onClick={() => void onRefresh()}
                >
                  <RefreshCw size={14} className={loading ? "spin" : undefined} />
                </button>
              </div>
            </div>
          </header>

          <CloudOverviewDashboard
            history={history}
            dashboard={dashboard}
            tree={tree}
            loading={loading}
          />
        </div>
      </main>
    </section>
  );
}

function CloudOverviewGitRemote({ value }: { value: string }) {
  const { t } = useLocalization();
  const [copied, setCopied] = useState(false);
  const label = copied
    ? t("cloud.common.copied")
    : `${t("cloud.common.copyValue")}: ${t("cloud.overview.repositoryRemote")}`;
  const GitRemoteIcon = getCloudRoute("git-sync").icon;

  const handleCopy = async () => {
    await copyText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="desktop-cloud-overview-git-remote">
      <GitRemoteIcon size={13} aria-hidden="true" />
      <code dir="ltr" title={value}>{value}</code>
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={() => void handleCopy()}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </div>
  );
}

function CloudOverviewHeaderFact({
  label,
  value,
  valueTitle,
  ariaLabel,
  onClick,
}: {
  label: string;
  value: string;
  valueTitle?: string;
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      className="desktop-cloud-overview-header-fact desktop-cloud-overview-header-fact--interactive"
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
    >
      <span className="desktop-cloud-overview-header-fact-label">{label}</span>
      <strong title={valueTitle}>{value}</strong>
    </button>
  );
}

function CloudOverviewStorageMeter({
  usage,
  loading,
}: {
  usage: CloudOverviewStorageUsage;
  loading: boolean;
}) {
  const localization = useLocalization();
  const { t } = localization;
  const used = usage.bytes === null
    ? loading ? t("cloud.common.loading") : "—"
    : `${formatBytes(usage.bytes, localization)}${usage.isLowerBound ? "+" : ""}`;
  const detail = usage.limitBytes === null
    ? used
    : `${used} ${t("cloud.billing.storageLimit", {
      limit: formatBytes(usage.limitBytes, localization),
    })}`;
  const progressProps = usage.percent === null
    ? { "aria-hidden": true as const }
    : {
        role: "progressbar" as const,
        "aria-label": t("cloud.billing.storageUsage"),
        "aria-valuemin": 0,
        "aria-valuemax": 100,
        "aria-valuenow": Math.round(usage.percent),
      };

  return (
    <div className="desktop-cloud-overview-header-fact desktop-cloud-overview-project-storage">
      <span className="desktop-cloud-overview-header-fact-label">{t("cloud.billing.storageUsage")}</span>
      <strong>{detail}</strong>
      <span className="desktop-cloud-overview-project-storage-track" {...progressProps}>
        {usage.percent !== null ? (
          <span style={{ width: `${usage.percent}%` }} />
        ) : null}
      </span>
    </div>
  );
}
