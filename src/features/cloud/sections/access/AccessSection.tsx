import { ArrowRight, ChevronRight, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  DesktopCloudConnector,
  DesktopCloudMcpEndpoint,
  DesktopCloudRepoIdentity,
  DesktopCloudScope,
} from "../../../../lib/cloudApi";
import { PageLoading } from "../../../../components/loading";
import { DesktopOverlayPortal } from "../../../app-shell/DesktopOverlayPortal";
import { getCloudAccessFilterDescriptor, type CloudAccessFilter } from "../../accessFilters";
import type { CloudWorkspaceSection } from "../../types";
import {
  CloudAuthorityCell,
  CloudCommandBlock,
  CloudWebEmpty,
} from "../../components/shared";
import { buildCloudAccessSurfaces, type CloudAccessSurface } from "../../model";
import {
  formatProviderLabel,
  formatRelativeTime,
  formatStatusLabel,
  getCloudScopeRows,
  getScopePathLabel,
  getApiBaseFromGitUrl,
  getScopeDisplayName,
  getCloudProviderIconUrl,
  isCloudIntegrationConnector,
  isConnectorActiveStatus,
  profileSlug,
  providerIcon,
  scopeMatchesMcpEndpoint,
  shellQuote,
} from "../../utils";

type CloudAccessSurfaceRow = {
  id: string;
  scope: DesktopCloudScope;
  surface: CloudAccessSurface;
};

export function CloudAccessSection({
  projectId,
  apiBaseUrl,
  identity,
  scopes,
  connectors,
  mcpEndpoints,
  filter = "all",
  integrationProviderFilter = null,
  loading,
  onOpenProject,
  onOpenIntegrations,
}: {
  projectId: string;
  apiBaseUrl: string | null;
  identity: DesktopCloudRepoIdentity | null;
  scopes: DesktopCloudScope[];
  connectors: DesktopCloudConnector[];
  mcpEndpoints: DesktopCloudMcpEndpoint[];
  filter?: CloudAccessFilter;
  integrationProviderFilter?: string | null;
  loading: boolean;
  onOpenProject: (projectId: string, section?: CloudWorkspaceSection) => void;
  onOpenIntegrations?: (projectId: string) => void;
}) {
  const scopeRows = getCloudScopeRows(scopes, identity);
  const scopeKey = scopeRows.map((scope) => scope.id).join("|");
  const apiBase = identity?.url ? getApiBaseFromGitUrl(identity.url) : apiBaseUrl ?? "";
  const accessRows = scopeRows.flatMap((scope): CloudAccessSurfaceRow[] => {
    const scopeConnectors = connectors.filter((connector) => connector.scope_id === scope.id);
    const scopeMcpEndpoints = mcpEndpoints.filter((endpoint) => scopeMatchesMcpEndpoint(scope, endpoint));
    const scopeName = getScopeDisplayName(scope);
    const profileName = profileSlug(scopeName);
    const gitUrl = scope.access_key && apiBase ? `${apiBase}/git/ap/${scope.access_key}.git` : identity?.url ?? "";
    const cliCommand = scope.access_key && apiBase
      ? `printf '%s' ${shellQuote(scope.access_key)} | puppyone ap login ${shellQuote(profileName)} --api-url ${shellQuote(apiBase)} --access-key-stdin`
      : "";

    return buildCloudAccessSurfaces({
      scope,
      connectors: scopeConnectors,
      mcpEndpoints: scopeMcpEndpoints,
      apiBase,
      gitUrl,
      cliCommand,
      profileName,
    }).map((surface) => ({
      id: `${scope.id}:${surface.id}`,
      scope,
      surface,
    }));
  });
  const accessRowKey = accessRows.map((row) => row.id).join("|");
  const integrationRows = accessRows.filter((row) => cloudAccessRowMatchesFilter(row, "integrations"));
  const visibleRows = accessRows.filter((row) => (
    cloudAccessRowMatchesFilter(row, filter) &&
    cloudAccessRowMatchesIntegrationProvider(row, integrationProviderFilter)
  ));
  const visibleRowKey = visibleRows.map((row) => row.id).join("|");
  const filterDescriptor = getCloudAccessFilterDescriptor(filter);
  const pageTitle = filter === "integrations" && integrationProviderFilter
    ? formatProviderLabel(integrationProviderFilter)
    : filterDescriptor.title;
  const pageDescription = filter === "integrations" && integrationProviderFilter
    ? `Connected ${formatProviderLabel(integrationProviderFilter)} sync surfaces attached to this Cloud project.`
    : filterDescriptor.description;
  const [detailRowId, setDetailRowId] = useState<string | null>(null);

  useEffect(() => {
    if (detailRowId && !visibleRows.some((row) => row.id === detailRowId)) {
      setDetailRowId(null);
    }
  }, [scopeKey, accessRowKey, visibleRowKey, detailRowId]);

  useEffect(() => {
    if (!detailRowId) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDetailRowId(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [detailRowId]);

  const detailRow = visibleRows.find((row) => row.id === detailRowId) ?? null;

  if (filter === "integrations") {
    return (
      <CloudIntegrationsPage
        rows={visibleRows}
        totalCount={integrationProviderFilter ? visibleRows.length : integrationRows.length}
        loading={loading}
        detailRow={detailRow}
        onAddSync={() => {
          if (onOpenIntegrations) onOpenIntegrations(projectId);
          else onOpenProject(projectId, "access");
        }}
        onOpenRow={(rowId) => setDetailRowId(rowId)}
        onCloseDetail={() => setDetailRowId(null)}
        onOpenAccess={() => onOpenProject(projectId, "access")}
      />
    );
  }

  return (
    <section className="desktop-cloud-access-page list-view">
      <div className="desktop-cloud-access-hero">
        <div>
          <h1>{pageTitle}</h1>
          <p>{pageDescription}</p>
        </div>
        <button className="desktop-cloud-row-action" type="button" onClick={() => onOpenProject(projectId, "access")}>
          <Plus size={14} />
          <span>New access</span>
        </button>
      </div>
      {loading ? (
        <PageLoading variant="fill" label="Loading" className="desktop-cloud-web-loading" />
      ) : scopeRows.length === 0 ? (
        <CloudWebEmpty
          icon={filterDescriptor.icon}
          title={filterDescriptor.emptyTitle}
          detail={filterDescriptor.emptyDetail}
        />
      ) : visibleRows.length === 0 ? (
        <CloudWebEmpty
          icon={filterDescriptor.icon}
          title={filterDescriptor.emptyTitle}
          detail={filterDescriptor.emptyDetail}
        />
      ) : (
        <div className="desktop-cloud-access-list-layout">
          <section className="desktop-cloud-access-folder-section">
            <div className="desktop-cloud-access-folder-table" role="table" aria-label="Cloud access surfaces">
              <div className="desktop-cloud-access-folder-row header" role="row">
                <span>Access</span>
                <span>Cloud path</span>
                <span>Status</span>
                <span />
              </div>
              {visibleRows.map(({ id, scope, surface }) => {
                const SurfaceIcon = providerIcon(surface.provider);
                const live = isConnectorActiveStatus(surface.status);
                const statusLabel = live ? "Live" : formatStatusLabel(surface.statusLabel || surface.status);
                return (
                  <button
                    className="desktop-cloud-access-folder-row"
                    key={id}
                    type="button"
                    role="row"
                    title={`${surface.title} · ${getScopePathLabel(scope)}`}
                    onClick={() => setDetailRowId(id)}
                  >
                    <span className="desktop-cloud-access-folder-name" role="cell">
                      <span className="desktop-cloud-access-folder-icon" aria-hidden="true">
                        <SurfaceIcon size={15} />
                      </span>
                      <span>
                        <strong>{surface.title}</strong>
                        <small>{surface.subtitle}</small>
                      </span>
                    </span>
                    <span className="desktop-cloud-access-folder-path" role="cell">
                      <code>{getScopePathLabel(scope)}</code>
                    </span>
                    <span className="desktop-cloud-access-folder-status" role="cell">
                      <span className={`desktop-cloud-access-status-pill ${live ? "live" : "muted"}`}>
                        <span className={`desktop-cloud-web-status-dot ${live ? "ready" : ""}`} aria-hidden="true" />
                        {statusLabel}
                      </span>
                    </span>
                    <span className="desktop-cloud-access-folder-action" role="cell">
                      <span>Open</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {detailRow && (
            <DesktopOverlayPortal>
              <div className="desktop-cloud-access-detail-overlay" role="presentation">
                <button
                  className="desktop-cloud-access-detail-scrim"
                  type="button"
                  aria-label="Close access details"
                  onClick={() => setDetailRowId(null)}
                />
                <section
                  className="desktop-cloud-access-detail-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-label={`${detailRow.surface.title} access details`}
                >
                  <button
                    className="desktop-cloud-access-detail-close"
                    type="button"
                    aria-label="Close access details"
                    onClick={() => setDetailRowId(null)}
                  >
                    <X size={15} />
                  </button>
                  <div className="desktop-cloud-access-detail">
                    <CloudAccessSurfaceDetail
                      row={detailRow}
                      onOpenAccess={() => onOpenProject(projectId, "access")}
                    />
                  </div>
                </section>
              </div>
            </DesktopOverlayPortal>
          )}
        </div>
      )}
    </section>
  );
}

function CloudIntegrationsPage({
  rows,
  totalCount,
  loading,
  detailRow,
  onAddSync,
  onOpenRow,
  onCloseDetail,
  onOpenAccess,
}: {
  rows: CloudAccessSurfaceRow[];
  totalCount: number;
  loading: boolean;
  detailRow: CloudAccessSurfaceRow | null;
  onAddSync: () => void;
  onOpenRow: (rowId: string) => void;
  onCloseDetail: () => void;
  onOpenAccess: () => void;
}) {
  return (
    <section className="desktop-cloud-integrations-page">
      <header className="desktop-cloud-integrations-page-header">
        <div className="desktop-cloud-integrations-title-group">
          <span className="desktop-cloud-integrations-page-title">Integrations</span>
          <span className="desktop-cloud-integrations-count-badge">{totalCount}</span>
        </div>
      </header>
      <main className="desktop-cloud-integrations-canvas">
        <section className="desktop-cloud-integrations-catalog">
          {loading ? (
            <div className="desktop-cloud-integrations-blank-detail">
              <PageLoading variant="fill" label="Loading" className="desktop-cloud-web-loading" />
            </div>
          ) : rows.length === 0 ? (
            <CloudIntegrationEmptyPanel onAddSync={onAddSync} />
          ) : (
            <section className="desktop-cloud-integrations-section">
              <div className="desktop-cloud-integrations-heading">
                <button type="button" className="desktop-cloud-integrations-add-sync" onClick={onAddSync}>
                  <Plus size={14} />
                  <span>Add sync</span>
                </button>
              </div>
              <div className="desktop-cloud-integrations-detail">
                <CloudIntegrationAccessList
                  rows={rows}
                  selectedRowId={detailRow?.id ?? null}
                  onOpenRow={onOpenRow}
                />
              </div>
            </section>
          )}
        </section>
      </main>
      {detailRow && (
        <DesktopOverlayPortal>
          <div className="desktop-cloud-access-detail-overlay" role="presentation">
            <button
              className="desktop-cloud-access-detail-scrim"
              type="button"
              aria-label="Close sync details"
              onClick={onCloseDetail}
            />
            <section
              className="desktop-cloud-access-detail-modal"
              role="dialog"
              aria-modal="true"
              aria-label={`${detailRow.surface.title} sync details`}
            >
              <button
                className="desktop-cloud-access-detail-close"
                type="button"
                aria-label="Close sync details"
                onClick={onCloseDetail}
              >
                <X size={15} />
              </button>
              <div className="desktop-cloud-access-detail">
                <CloudAccessSurfaceDetail row={detailRow} onOpenAccess={onOpenAccess} />
              </div>
            </section>
          </div>
        </DesktopOverlayPortal>
      )}
    </section>
  );
}

function CloudIntegrationEmptyPanel({ onAddSync }: { onAddSync: () => void }) {
  return (
    <div className="desktop-cloud-integrations-empty-catalog-panel">
      <h2>No syncs yet</h2>
      <p>Create a sync to bring an external resource into this project.</p>
      <button type="button" className="desktop-cloud-integrations-empty-action" onClick={onAddSync}>
        <Plus size={14} />
        <span>Add sync</span>
      </button>
    </div>
  );
}

function cloudAccessRowMatchesFilter(row: CloudAccessSurfaceRow, filter: CloudAccessFilter): boolean {
  const provider = row.surface.provider;
  switch (filter) {
    case "all":
      return true;
    case "cli":
      return provider === "cli";
    case "git":
      return provider === "filesystem" || provider === "git" || provider === "git_remote";
    case "mcp":
      return Boolean(row.surface.endpoint) || provider === "mcp" || provider === "mcp_endpoint";
    case "integrations":
      return row.surface.connector ? isCloudIntegrationConnector(row.surface.connector) : false;
    default:
      return true;
  }
}

function cloudAccessRowMatchesIntegrationProvider(row: CloudAccessSurfaceRow, providerFilter: string | null): boolean {
  if (!providerFilter) return true;
  return (row.surface.connector?.provider ?? row.surface.provider) === providerFilter;
}

function CloudIntegrationAccessList({
  rows,
  selectedRowId,
  onOpenRow,
}: {
  rows: CloudAccessSurfaceRow[];
  selectedRowId?: string | null;
  onOpenRow: (rowId: string) => void;
}) {
  const providerGroups = getIntegrationProviderGroups(rows);

  return (
    <section className="desktop-cloud-integrations-list" aria-label="Cloud integrations">
      {providerGroups.map((group) => {
        const ProviderIcon = providerIcon(group.provider);
        const iconUrl = getCloudProviderIconUrl(group.provider);
        return (
          <section className="desktop-cloud-integration-provider-group" key={group.provider}>
            <div className="desktop-cloud-integration-provider-header">
              <h2>{group.label}</h2>
              <span>{group.rows.length}</span>
            </div>
            <div className="desktop-cloud-integration-provider-body">
              <div className="desktop-cloud-integration-provider-summary" aria-hidden="true">
                <span className="desktop-cloud-integration-provider-hero">
                  {iconUrl ? <img src={iconUrl} alt="" /> : <ProviderIcon size={40} />}
                </span>
              </div>
              <div className="desktop-cloud-integration-connection-list">
                {group.rows.map((row) => {
                  const connector = row.surface.connector;
                  if (!connector) return null;
                  const connectionTitle = connector.name || group.label;
                  const statusLabel = formatStatusLabel(connector.status || "active");
                  const statusTone = getIntegrationStatusTone(connector.status);
                  const lastRunLabel = formatRelativeTime(connector.last_run_at || connector.updated_at);
                  const targetPath = formatIntegrationPathTrailLabel(row.scope);
                  return (
                    <button
                      className={`desktop-cloud-integration-connection-card ${selectedRowId === row.id ? "selected" : ""}`}
                      key={row.id}
                      type="button"
                      title={`${connectionTitle} · ${getScopePathLabel(row.scope)}`}
                      onClick={() => onOpenRow(row.id)}
                    >
                      <span className="desktop-cloud-integration-route">
                        <span className="desktop-cloud-integration-source-config" title={`${group.label}: ${connectionTitle}`}>
                          {iconUrl ? <img src={iconUrl} alt="" /> : <ProviderIcon size={16} />}
                          <span>{group.label}</span>
                        </span>
                        <ArrowRight size={15} />
                        <span className="desktop-cloud-integration-path-trail">
                          <img src="/icons/folder.svg" alt="" />
                          <span>{targetPath}</span>
                        </span>
                      </span>
                      <span className="desktop-cloud-integration-right">
                        <span className="desktop-cloud-integration-meta">
                          <span className={`desktop-cloud-integration-status-meta ${statusTone}`}>
                            <span className="desktop-cloud-integration-status-dot" aria-hidden="true" />
                            {statusLabel}
                          </span>
                          <span>{connector.direction || "manual"}</span>
                          <span>{lastRunLabel ? `Last synced ${lastRunLabel}` : "Never synced"}</span>
                        </span>
                        <span className="desktop-cloud-integration-manage">
                          Manage
                          <ChevronRight size={13} />
                        </span>
                      </span>
                      {connector.error_message && (
                        <span className="desktop-cloud-integration-error">{connector.error_message}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        );
      })}
    </section>
  );
}

function getIntegrationProviderGroups(rows: CloudAccessSurfaceRow[]) {
  const groups = new Map<string, {
    provider: string;
    label: string;
    rows: CloudAccessSurfaceRow[];
  }>();
  for (const row of rows) {
    const provider = row.surface.connector?.provider ?? row.surface.provider;
    const group = groups.get(provider) ?? {
      provider,
      label: formatProviderLabel(provider),
      rows: [],
    };
    group.rows.push(row);
    groups.set(provider, group);
  }
  return [...groups.values()].sort((left, right) => left.label.localeCompare(right.label));
}

function getIntegrationStatusTone(status: string | null | undefined) {
  const normalized = status?.toLowerCase() ?? "";
  if (normalized === "active" || normalized === "ready" || normalized === "connected" || normalized === "success") {
    return "success";
  }
  if (normalized === "syncing" || normalized === "processing" || normalized === "running") {
    return "accent";
  }
  if (normalized === "paused" || normalized === "pending" || normalized === "warning" || normalized === "queued") {
    return "warning";
  }
  if (normalized === "error" || normalized === "failed" || normalized === "blocked") {
    return "danger";
  }
  return "muted";
}

function formatIntegrationPathTrailLabel(scope: DesktopCloudScope) {
  const path = getScopePathLabel(scope);
  if (path === "/") return "/";
  return `/ ${path.replace(/^\/+/, "").split("/").filter(Boolean).join(" / ")}`;
}

function CloudAccessSurfaceDetail({
  row,
  onOpenAccess,
}: {
  row: CloudAccessSurfaceRow;
  onOpenAccess: () => void;
}) {
  const { scope, surface } = row;
  const Icon = providerIcon(surface.provider);
  const live = isConnectorActiveStatus(surface.status);
  const statusLabel = live ? "Live" : formatStatusLabel(surface.statusLabel || surface.status);

  return (
    <div className="desktop-cloud-access-surface-detail-panel">
      <header className="desktop-cloud-access-surface-detail-header">
        <span className={`desktop-cloud-access-provider-tile ${surface.provider}`} aria-hidden="true">
          <Icon size={surface.provider === "cli" ? 16 : 15} />
        </span>
        <div>
          <h1>{surface.title}</h1>
          <p>{surface.subtitle}</p>
        </div>
        <span className={`desktop-cloud-access-status-pill ${live ? "live" : "muted"}`}>
          <span className={`desktop-cloud-web-status-dot ${live ? "ready" : ""}`} aria-hidden="true" />
          {statusLabel}
        </span>
      </header>

      <div className="desktop-cloud-access-surface-detail-meta">
        <CloudAuthorityCell label="Cloud path" value={getScopePathLabel(scope)} mono />
        <CloudAuthorityCell label="Type" value={formatProviderLabel(surface.provider)} />
        {surface.connector && (
          <CloudAuthorityCell
            label="Direction"
            value={surface.connector.direction || "manual"}
          />
        )}
        {surface.endpoint && (
          <CloudAuthorityCell
            label="Endpoint"
            value={surface.endpoint.api_key_hint || "Hidden"}
          />
        )}
      </div>

      {surface.prompt && <p className="desktop-cloud-access-surface-detail-note">{surface.prompt}</p>}

      {surface.commands?.length ? (
        <div className="desktop-cloud-access-surface-detail-commands">
          {surface.commands.map((command) => (
            <CloudCommandBlock
              key={command.label}
              label={command.label}
              value={command.value}
              disabled={command.disabled}
            />
          ))}
        </div>
      ) : null}

      {surface.connector && (
        <div className="desktop-cloud-access-connector-summary">
          <CloudAuthorityCell label="Provider" value={formatProviderLabel(surface.connector.provider)} />
          <CloudAuthorityCell label="Direction" value={surface.connector.direction || "manual"} />
          <CloudAuthorityCell
            label="Status"
            value={formatStatusLabel(surface.connector.status)}
            tone={isConnectorActiveStatus(surface.connector.status) ? "ready" : "warning"}
          />
        </div>
      )}

      {surface.endpoint?.description && (
        <p className="desktop-cloud-access-expanded-note">{surface.endpoint.description}</p>
      )}

      <div className="desktop-cloud-access-surface-detail-footer">
        <button className="desktop-cloud-row-action" type="button" onClick={onOpenAccess}>
          Open Cloud settings
        </button>
      </div>
    </div>
  );
}
