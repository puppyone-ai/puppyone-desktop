import { ArrowRight, ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import type {
  DesktopCloudScope,
  DesktopCloudSession,
} from "../../lib/cloudApi";
import { PageLoading } from "../../components/loading";
import {
  formatProviderLabel,
  formatRelativeTime,
  formatStatusLabel,
  getCloudProviderIconUrl,
  getScopePathLabel,
  providerIcon,
} from "../cloud/utils";
import type { CloudAutomationRow } from "./automationDomain";
import { CloudManageSyncDialog, CloudNewSyncDialog } from "./AutomationDialogs";

export function CloudAutomationPage({
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
  onOpenAutomation,
}: {
  projectId: string;
  cloudSession: DesktopCloudSession;
  apiBaseUrl: string | null;
  rows: CloudAutomationRow[];
  totalCount: number;
  loading: boolean;
  detailRow: CloudAutomationRow | null;
  onOpenRow: (rowId: string) => void;
  onCloseDetail: () => void;
  onCloudSessionChange: (session: DesktopCloudSession | null) => void;
  onRefresh: () => Promise<void>;
  onOpenAccess: () => void;
  onOpenAutomation: () => void;
}) {
  const [newSyncOpen, setNewSyncOpen] = useState(false);

  return (
    <section className="desktop-cloud-automation-page">
      <header className="desktop-cloud-automation-page-header">
        <div className="desktop-cloud-automation-title-group">
          <span className="desktop-cloud-automation-page-title">Automation</span>
          <span className="desktop-cloud-automation-count-badge">{totalCount}</span>
        </div>
      </header>
      <main className="desktop-cloud-automation-canvas">
        <section className="desktop-cloud-automation-catalog">
          {loading ? (
            <div className="desktop-cloud-automation-blank-detail">
              <PageLoading variant="fill" label="Loading" className="desktop-cloud-web-loading" />
            </div>
          ) : rows.length === 0 ? (
            <CloudAutomationEmptyPanel onAddSync={() => setNewSyncOpen(true)} />
          ) : (
            <section className="desktop-cloud-automation-section">
              <div className="desktop-cloud-automation-heading">
                <button type="button" className="desktop-cloud-automation-add-sync" onClick={() => setNewSyncOpen(true)}>
                  <Plus size={14} />
                  <span>Add sync</span>
                </button>
              </div>
              <div className="desktop-cloud-automation-detail">
                <CloudAutomationAccessList
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
          onOpenAutomation={onOpenAutomation}
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

function CloudAutomationEmptyPanel({ onAddSync }: { onAddSync: () => void }) {
  return (
    <div className="desktop-cloud-automation-empty-catalog-panel">
      <h2>No syncs yet</h2>
      <p>Create a sync to bring an external resource into this project.</p>
      <button type="button" className="desktop-cloud-automation-empty-action" onClick={onAddSync}>
        <Plus size={14} />
        <span>Add sync</span>
      </button>
    </div>
  );
}

function CloudAutomationAccessList({
  rows,
  selectedRowId,
  onOpenRow,
}: {
  rows: CloudAutomationRow[];
  selectedRowId?: string | null;
  onOpenRow: (rowId: string) => void;
}) {
  const providerGroups = getAutomationProviderGroups(rows);

  return (
    <section className="desktop-cloud-automation-list" aria-label="Cloud automation">
      {providerGroups.map((group) => {
        const ProviderIcon = providerIcon(group.provider);
        const iconUrl = getCloudProviderIconUrl(group.provider);
        return (
          <section className="desktop-cloud-automation-provider-group" key={group.provider}>
            <div className="desktop-cloud-automation-provider-header">
              <h2>{group.label}</h2>
              <span>{group.rows.length}</span>
            </div>
            <div className="desktop-cloud-automation-provider-body">
              <div className="desktop-cloud-automation-provider-summary" aria-hidden="true">
                <span className="desktop-cloud-automation-provider-hero">
                  {iconUrl ? <img src={iconUrl} alt="" /> : <ProviderIcon size={40} />}
                </span>
              </div>
              <div className="desktop-cloud-automation-connection-list">
                {group.rows.map((row) => {
                  const connector = row.connector;
                  const connectionTitle = connector.name || group.label;
                  const statusLabel = formatStatusLabel(connector.status || "active");
                  const statusTone = getAutomationStatusTone(connector.status);
                  const lastRunLabel = formatRelativeTime(connector.last_run_at || connector.updated_at);
                  const targetPath = formatAutomationPathTrailLabel(row.scope);
                  return (
                    <button
                      className={`desktop-cloud-automation-connection-card ${selectedRowId === row.id ? "selected" : ""}`}
                      key={row.id}
                      type="button"
                      title={`${connectionTitle} · ${getScopePathLabel(row.scope)}`}
                      onClick={() => onOpenRow(row.id)}
                    >
                      <span className="desktop-cloud-automation-route">
                        <span className="desktop-cloud-automation-source-config" title={`${group.label}: ${connectionTitle}`}>
                          {iconUrl ? <img src={iconUrl} alt="" /> : <ProviderIcon size={16} />}
                          <span>{group.label}</span>
                        </span>
                        <ArrowRight size={15} />
                        <span className="desktop-cloud-automation-path-trail">
                          <img src="/icons/folder.svg" alt="" />
                          <span>{targetPath}</span>
                        </span>
                      </span>
                      <span className="desktop-cloud-automation-right">
                        <span className="desktop-cloud-automation-meta">
                          <span className={`desktop-cloud-automation-status-meta ${statusTone}`}>
                            <span className="desktop-cloud-automation-status-dot" aria-hidden="true" />
                            {statusLabel}
                          </span>
                          <span>{connector.direction || "manual"}</span>
                          <span>{lastRunLabel ? `Last synced ${lastRunLabel}` : "Never synced"}</span>
                        </span>
                        <span className="desktop-cloud-automation-manage">
                          Manage
                          <ChevronRight size={13} />
                        </span>
                      </span>
                      {connector.error_message && (
                        <span className="desktop-cloud-automation-error">{connector.error_message}</span>
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

function getAutomationProviderGroups(rows: CloudAutomationRow[]) {
  const groups = new Map<string, {
    provider: string;
    label: string;
    rows: CloudAutomationRow[];
  }>();
  for (const row of rows) {
    const provider = row.connector.provider;
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

function getAutomationStatusTone(status: string | null | undefined) {
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

function formatAutomationPathTrailLabel(scope: DesktopCloudScope) {
  const path = getScopePathLabel(scope);
  if (path === "/") return "/";
  return `/ ${path.replace(/^\/+/, "").split("/").filter(Boolean).join(" / ")}`;
}
