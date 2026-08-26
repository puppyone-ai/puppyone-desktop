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
import type { CloudWorkspaceSection } from "../../types";
import { CloudWorkspaceLoadingState } from "../../components/shared";
import { getCloudRoute } from "../../routes/cloudRoutes";
import { copyText, formatBytes } from "../../utils";
import { CloudOverviewDashboard } from "./OverviewDashboard";
import {
  getCloudOverviewMetrics,
  getCloudOverviewStorageUsage,
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
  const { t } = localization;
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
  const SettingsIcon = getCloudRoute("settings").icon;
  const hasOverviewData = Boolean(
    dashboard
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
              <CloudOverviewStorageMeter usage={storageUsage} loading={loading} />
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
          </header>

          <CloudOverviewDashboard
            projectUpdatedAt={project?.updated_at ?? null}
            history={history}
            dashboard={dashboard}
            tree={tree}
            accessPointCount={overviewMetrics.accessPointCount}
            loading={loading}
            onSelectSection={onSelectSection}
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

  const handleCopy = async () => {
    await copyText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };
  const GitRemoteIcon = getCloudRoute("git-sync").icon;

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
    <div className="desktop-cloud-overview-project-storage">
      <div className="desktop-cloud-overview-project-storage-copy">
        <span>{t("cloud.billing.storageUsage")}</span>
        <strong>{detail}</strong>
      </div>
      <span className="desktop-cloud-overview-project-storage-track" {...progressProps}>
        {usage.percent !== null ? (
          <span style={{ width: `${usage.percent}%` }} />
        ) : null}
      </span>
    </div>
  );
}
