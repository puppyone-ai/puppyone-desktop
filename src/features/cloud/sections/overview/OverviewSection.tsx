import {
  Check,
  Cloud,
  Copy,
  GitBranch,
  RefreshCw,
  Settings,
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
} from "../../../../lib/cloudApi";
import type { DesktopCloudHistory } from "../../../../lib/cloudHistoryApi";
import type { CloudWorkspaceSection } from "../../types";
import { CloudWorkspaceLoadingState } from "../../components/shared";
import { copyText } from "../../utils";
import { CloudOverviewDashboard } from "./OverviewDashboard";
import { getCloudOverviewMetrics } from "./overviewMetrics";

export function CloudRepositoryOverview({
  workspace,
  project,
  dashboard,
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
            <div className="desktop-cloud-overview-landing-identity">
              <span
                className="desktop-cloud-overview-landing-mark"
                aria-label={t("cloud.common.cloudSource")}
                title={t("cloud.common.cloudSource")}
              >
                <Cloud size={20} />
              </span>
              <div className="desktop-cloud-overview-landing-copy">
                <div className="desktop-cloud-overview-landing-title-row">
                  <h1 dir="auto">{projectName}</h1>
                </div>
                {projectDescription ? <p dir="auto">{projectDescription}</p> : null}
                {gitRemoteUrl ? <CloudOverviewGitRemote value={gitRemoteUrl} /> : null}
              </div>
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
                  <Settings size={14} />
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
            history={history}
            dashboard={dashboard}
            accessRows={overviewMetrics.accessRows}
            automationRows={overviewMetrics.automationRows}
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

  return (
    <div className="desktop-cloud-overview-git-remote">
      <GitBranch size={13} aria-hidden="true" />
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
