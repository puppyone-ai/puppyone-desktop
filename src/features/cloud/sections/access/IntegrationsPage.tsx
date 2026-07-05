import { ArrowRight, ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import type {
  DesktopCloudScope,
  DesktopCloudSession,
} from "../../../../lib/cloudApi";
import { PageLoading } from "../../../../components/loading";
import {
  CloudAuthorityCell,
  CloudCommandBlock,
  CloudWebEmpty,
} from "../../components/shared";
import {
  formatProviderLabel,
  formatRelativeTime,
  formatStatusLabel,
  getCloudProviderIconUrl,
  getScopePathLabel,
  isConnectorActiveStatus,
  providerIcon,
} from "../../utils";
import type { CloudAccessSurfaceRow } from "./accessRows";
import { CloudManageSyncDialog, CloudNewSyncDialog } from "./WorkflowDialogs";

export function CloudIntegrationsPage({
  projectId,
  cloudSession,
  apiBaseUrl,
  rows,
  totalCount,
  loading,
  detailRow,
  onOpenRow,
  onCloseDetail,
  onCloudSessionChange,
  onRefresh,
  onOpenAccess,
  onOpenIntegrations,
}: {
  projectId: string;
  cloudSession: DesktopCloudSession;
  apiBaseUrl: string | null;
  rows: CloudAccessSurfaceRow[];
  totalCount: number;
  loading: boolean;
  detailRow: CloudAccessSurfaceRow | null;
  onOpenRow: (rowId: string) => void;
  onCloseDetail: () => void;
  onCloudSessionChange: (session: DesktopCloudSession | null) => void;
  onRefresh: () => Promise<void>;
  onOpenAccess: () => void;
  onOpenIntegrations: () => void;
}) {
  const [newSyncOpen, setNewSyncOpen] = useState(false);

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
            <CloudIntegrationEmptyPanel onAddSync={() => setNewSyncOpen(true)} />
          ) : (
            <section className="desktop-cloud-integrations-section">
              <div className="desktop-cloud-integrations-heading">
                <button type="button" className="desktop-cloud-integrations-add-sync" onClick={() => setNewSyncOpen(true)}>
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
      {newSyncOpen && (
        <CloudNewSyncDialog
          projectId={projectId}
          cloudSession={cloudSession}
          apiBaseUrl={apiBaseUrl}
          onCloudSessionChange={onCloudSessionChange}
          onRefresh={onRefresh}
          onOpenIntegrations={onOpenIntegrations}
          onClose={() => setNewSyncOpen(false)}
        />
      )}
      {detailRow && (
        <CloudManageSyncDialog
          row={detailRow}
          cloudSession={cloudSession}
          apiBaseUrl={apiBaseUrl}
          onCloudSessionChange={onCloudSessionChange}
          onRefresh={onRefresh}
          onOpenAccess={onOpenAccess}
          onClose={onCloseDetail}
        />
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
