import { Cloud, ExternalLink, RefreshCw, Unlink } from "lucide-react";
import { useState } from "react";
import type { Workspace } from "@puppyone/shared-ui";
import { bidiIsolate, type MessageFormatter } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import type {
  DesktopCloudConnector,
  DesktopCloudDashboard,
  DesktopCloudMcpEndpoint,
  DesktopCloudProject,
  DesktopCloudRepoIdentity,
  DesktopCloudScope,
  DesktopCloudTree,
  DesktopCloudTreeEntry,
} from "../../../lib/cloudApi";
import type { DesktopCloudHistory } from "../../../lib/cloudHistoryApi";
import {
  ProjectFolderCard,
  type ProjectFolderPreviewItem,
} from "../../../components/project-folder-card";
import { isCloudAutomationConnector } from "../../automation/automationDomain";
import type { CloudWorkspaceSection } from "../types";
import {
  CloudFilePreviewIcon,
  CloudWorkspaceLoadingState,
} from "../components/shared";
import {
  formatCloudDate,
  formatInteger,
  formatProviderLabel,
  formatRelativeTime,
  getCloudProviderIconUrl,
} from "../utils";

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
  matchesRepositoryRemote,
  loading,
  removeRemoteAction = null,
  onSelectSection,
  onOpenProject,
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
  matchesRepositoryRemote: boolean;
  loading: boolean;
  removeRemoteAction?: {
    busy?: boolean;
    onRemove: () => void;
  } | null;
  onSelectSection: (section: CloudWorkspaceSection) => void;
  onOpenProject: (projectId: string, section?: CloudWorkspaceSection) => void;
  onRefresh: () => Promise<void>;
}) {
  const localization = useLocalization();
  const { formatDate, formatNumber, t } = localization;
  const projectId = project?.id ?? dashboard?.project.id ?? identity?.project_id ?? "";
  const projectName = project?.name ?? dashboard?.project.name ?? workspace.name;
  const rootEntries = tree?.entries ?? [];
  const latestCommit = getLatestCloudHistoryCommit(history);
  const accessCount = scopes.length + mcpEndpoints.length;
  const accessDetail = formatAccessSummary(scopes.length, mcpEndpoints.length, t);
  const automationConnectors = connectors.filter(isCloudAutomationConnector);
  const latestChangeLabel = latestCommit?.created_at
    ? formatRelativeTime(latestCommit.created_at, localization)
    : history?.head_commit_id
      ? t("cloud.status.synced")
      : t("cloud.git.noChanges");
  const latestChangeDate = latestCommit?.created_at
    ? formatCloudDate(latestCommit.created_at, formatDate)
    : history?.head_commit_id
      ? t("cloud.status.synced")
      : t("cloud.git.noChanges");
  const hasOverviewData = Boolean(dashboard || tree || history || identity);
  const repositoryRemoteValue = matchesRepositoryRemote ? workspace.path : identity?.url ?? "";
  const [confirmRemoveRemote, setConfirmRemoveRemote] = useState(false);

  if (loading && !hasOverviewData) {
    return <CloudWorkspaceLoadingState label={t("cloud.loading.project")} />;
  }

  return (
    <section className="desktop-cloud-overview-focus" aria-label={t("cloud.overview.ariaLabel")}>
      <div className="desktop-cloud-overview-header">
        <div className="desktop-cloud-overview-heading">
          <div className="desktop-cloud-overview-title-row">
            <h1 dir="auto">{projectName}</h1>
            <span className="desktop-cloud-source-pill">
              <Cloud size={13} />
              <span>{t("cloud.common.cloudSource")}</span>
            </span>
          </div>
          {project?.description || dashboard?.project.description ? (
            <p dir="auto">{project?.description ?? dashboard?.project.description}</p>
          ) : null}
          {projectId && (
            <code className="desktop-cloud-project-id" title={projectId}>
              {t("cloud.project.id", { id: bidiIsolate(projectId) })}
            </code>
          )}
        </div>
        <div className="desktop-cloud-repo-actions">
          <button className="desktop-cloud-row-action" type="button" onClick={() => void onRefresh()}>
            <RefreshCw size={13} className={loading ? "spin" : undefined} />
            <span>{t("cloud.common.refresh")}</span>
          </button>
          {removeRemoteAction && (
            <button
              className="desktop-cloud-row-action"
              type="button"
              disabled={removeRemoteAction.busy}
              onBlur={() => setConfirmRemoveRemote(false)}
              onClick={() => {
                if (!confirmRemoveRemote) {
                  setConfirmRemoveRemote(true);
                  return;
                }
                setConfirmRemoveRemote(false);
                removeRemoteAction.onRemove();
              }}
            >
              <Unlink size={13} />
              <span>{t(removeRemoteAction.busy ? "cloud.project.removingRemote" : confirmRemoveRemote ? "cloud.project.confirmRemoveRemote" : "cloud.project.removeRemote")}</span>
            </button>
          )}
          {projectId && (
            <button className="desktop-cloud-row-action" type="button" onClick={() => onOpenProject(projectId, "overview")}>
              <ExternalLink size={13} />
              <span>{t("cloud.common.openWeb")}</span>
            </button>
          )}
        </div>
      </div>

      <div className="desktop-cloud-overview-body">
        <div className="desktop-cloud-overview-preview">
          <CloudProjectFolderPreview
            projectName={projectName}
            entries={rootEntries}
            loading={loading}
            updatedLabel={latestChangeLabel}
            statusConnected={matchesRepositoryRemote}
            onSelect={() => onSelectSection("contents")}
          />
        </div>

        <div className="desktop-cloud-overview-side">
          <div className="desktop-cloud-overview-doc">
            <CloudOverviewMetricCard
              label={t("cloud.overview.lastChange")}
              value={latestChangeDate}
              variant="date"
            />
            <CloudOverviewMetricCard
              label={t("cloud.route.access.title")}
              value={formatInteger(accessCount, formatNumber)}
              detail={accessDetail}
              tone={accessCount > 0 ? "ready" : undefined}
            />
            <CloudAutomationCard connectors={automationConnectors} />
          </div>

          <CloudRepositoryRemotePanel
            hasRepositoryRemote={matchesRepositoryRemote}
            value={repositoryRemoteValue}
          />
        </div>
      </div>
    </section>
  );
}

export function CloudRepositoryRemotePanel({
  hasRepositoryRemote,
  value,
}: {
  hasRepositoryRemote: boolean;
  value: string;
}) {
  const { t } = useLocalization();
  return (
    <div className={`desktop-cloud-local-map ${hasRepositoryRemote ? "has-remote" : "no-remote"}`}>
      <div className="desktop-cloud-local-map-main">
        <span>{t(hasRepositoryRemote ? "cloud.overview.repositoryRemote" : "cloud.overview.cloudUrl")}</span>
        <code title={value} dir="auto">{value || t("cloud.overview.noRepositoryRemote")}</code>
      </div>
    </div>
  );
}

export function CloudOverviewMetricCard({
  label,
  value,
  detail,
  tone,
  mono,
  variant,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "ready" | "warning";
  mono?: boolean;
  variant?: "date";
}) {
  return (
    <div className={`desktop-cloud-overview-metric ${tone ?? ""} ${mono ? "mono" : ""} ${variant ?? ""}`}>
      <span className="desktop-cloud-overview-metric-label">{label}</span>
      <div className="desktop-cloud-overview-metric-value">
        <strong title={value}>{value}</strong>
        {detail ? <small title={detail}>{detail}</small> : null}
      </div>
    </div>
  );
}

export function CloudAutomationCard({
  connectors,
}: {
  connectors: DesktopCloudConnector[];
}) {
  const { formatNumber, t } = useLocalization();
  return (
    <div className="desktop-cloud-automation-card">
      <div className="desktop-cloud-automation-heading">
        <span>{t("cloud.route.automation.title")}</span>
      </div>
      <div className="desktop-cloud-automation-value">
        {connectors.length > 0 ? (
          <>
            <span
              className="desktop-cloud-automation-icons"
              aria-label={t("cloud.overview.automationConnectionCount", { count: connectors.length })}
            >
              {connectors.map((connector) => (
                <CloudProviderTile key={connector.id} provider={connector.provider} />
              ))}
            </span>
            <small>{t("cloud.overview.connectedCount", { count: connectors.length })}</small>
          </>
        ) : (
          <>
            <strong>{formatNumber(0)}</strong>
            <small>{t("cloud.status.connected")}</small>
          </>
        )}
      </div>
    </div>
  );
}

export function CloudProviderTile({
  provider,
}: {
  provider: string;
}) {
  const { t } = useLocalization();
  const iconUrl = getCloudProviderIconUrl(provider);
  const label = formatProviderLabel(provider, t);
  const fallback = label[0]?.toUpperCase() || "I";

  return (
    <span className="desktop-cloud-provider-tile" aria-hidden="true">
      {iconUrl ? <img src={iconUrl} alt="" draggable={false} /> : <span>{fallback}</span>}
    </span>
  );
}

export function CloudProjectFolderPreview({
  projectName,
  entries,
  loading,
  updatedLabel,
  statusConnected,
  onSelect,
}: {
  projectName: string;
  entries: DesktopCloudTreeEntry[];
  loading: boolean;
  updatedLabel: string;
  statusConnected: boolean;
  onSelect: () => void;
}) {
  const { t } = useLocalization();
  const previewItems: ProjectFolderPreviewItem[] = entries.slice(0, 8).map((entry) => ({
    id: entry.path || entry.name,
    name: entry.name || entry.path,
    icon: (
      <CloudFilePreviewIcon
        name={entry.name || entry.path}
        type={entry.type}
        size={28}
        childrenCount={entry.children_count ?? undefined}
      />
    ),
  }));

  return (
    <ProjectFolderCard
      title={projectName}
      badge={null}
      previewItems={previewItems}
      previewLoading={loading}
      emptyLabel={t("cloud.overview.emptySource")}
      footer={{
        statusConnected,
        updatedLabel,
      }}
      onSelect={onSelect}
    />
  );
}

export function getLatestCloudHistoryCommit(history: DesktopCloudHistory | null): DesktopCloudHistory["commits"][number] | null {
  const commits = history?.commits ?? [];
  if (commits.length === 0) return null;
  return commits.find((commit) => commit.commit_id === history?.head_commit_id) ?? commits[0];
}

function formatAccessSummary(scopeCount: number, endpointCount: number, t: MessageFormatter) {
  if (endpointCount <= 0) return t("cloud.overview.scopeCount", { count: scopeCount });
  return t("cloud.overview.accessSummary", {
    scopes: scopeCount,
    connections: endpointCount,
  });
}
