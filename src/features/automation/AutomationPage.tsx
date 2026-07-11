import { ArrowRight, ChevronRight } from "lucide-react";
import { useState } from "react";
import type {
  DesktopCloudAutomationProviderSpec,
  DesktopCloudScope,
  DesktopCloudSession,
} from "../../lib/cloudApi";
import {
  formatProviderLabel,
  formatRelativeTime,
  formatStatusLabel,
  getCloudProviderIconUrl,
  getScopePathLabel,
  providerIcon,
} from "../cloud/utils";
import type { CloudAutomationRow } from "./automationDomain";
import { CloudManageAutomationDialog, CloudNewAutomationDialog } from "./AutomationDialogs";
import {
  AUTOMATION_CATEGORIES,
  buildAutomationTemplates,
  getAutomationTemplatesForCategory,
  type AutomationCatalogCategory,
  type AutomationTemplate,
} from "./automationTemplates";

export function CloudAutomationPage({
  projectId,
  cloudSession,
  apiBaseUrl,
  rows,
  totalCount,
  loading,
  providerSpecs,
  providerSpecsLoading,
  providerSpecsError,
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
  providerSpecs: DesktopCloudAutomationProviderSpec[];
  providerSpecsLoading: boolean;
  providerSpecsError: string | null;
  detailRow: CloudAutomationRow | null;
  onOpenRow: (rowId: string) => void;
  onCloseDetail: () => void;
  onCloudSessionChange: (session: DesktopCloudSession | null) => void;
  onRefresh: () => Promise<void>;
  onOpenAccess: () => void;
  onOpenAutomation: () => void;
}) {
  const [newAutomationOpen, setNewAutomationOpen] = useState(false);
  const [draftTemplate, setDraftTemplate] = useState<AutomationTemplate | null>(null);
  const [activeCategory, setActiveCategory] = useState<AutomationCatalogCategory>("popular");
  const templates = buildAutomationTemplates(providerSpecs);
  const visibleTemplates = getAutomationTemplatesForCategory(templates, activeCategory);

  const openNewAutomation = (template: AutomationTemplate | null = null) => {
    setDraftTemplate(template);
    setNewAutomationOpen(true);
  };

  return (
    <section className="desktop-cloud-automation-page">
      <main className="desktop-cloud-automation-canvas">
        <section className="desktop-cloud-automation-catalog">
          <header className="desktop-cloud-automation-landing-header">
            <div className="desktop-cloud-automation-landing-copy">
              <h1>Automations</h1>
              <p>Keep project knowledge current with always-on workflows that respond to changes.</p>
            </div>
            <button type="button" className="desktop-cloud-automation-new-button" onClick={() => openNewAutomation()}>
              New
            </button>
          </header>

          <nav className="desktop-cloud-automation-category-tabs" aria-label="Automation categories" role="tablist">
            {AUTOMATION_CATEGORIES.map((category) => {
              const active = activeCategory === category.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={active ? "active" : undefined}
                  onClick={() => setActiveCategory(category.id)}
                >
                  {category.label}
                </button>
              );
            })}
          </nav>

          <section className="desktop-cloud-automation-template-grid" aria-label={`${activeCategory} automation templates`}>
            {providerSpecsLoading ? Array.from({ length: 4 }, (_, index) => (
              <div className="desktop-cloud-automation-template-card skeleton" aria-hidden="true" key={index}>
                <span />
                <span />
                <span />
              </div>
            )) : visibleTemplates.map((template) => (
              <AutomationTemplateCard
                key={template.id}
                template={template}
                onAdd={() => openNewAutomation(template)}
              />
            ))}
          </section>

          {!providerSpecsLoading && providerSpecsError && (
            <div className="desktop-cloud-automation-catalog-error" role="alert">
              Unable to load Automation templates. {providerSpecsError}
            </div>
          )}

          {!providerSpecsLoading && !providerSpecsError && visibleTemplates.length === 0 && (
            <div className="desktop-cloud-automation-catalog-empty">
              No available sources in this category.
            </div>
          )}

          {loading ? (
            <div className="desktop-cloud-automation-existing-loading" role="status">Loading your automations…</div>
          ) : rows.length > 0 ? (
            <section className="desktop-cloud-automation-existing-section">
              <header className="desktop-cloud-automation-existing-header">
                <h2>Your automations</h2>
                <span>{totalCount}</span>
              </header>
              <div className="desktop-cloud-automation-detail">
                <CloudAutomationAccessList
                  rows={rows}
                  selectedRowId={detailRow?.id ?? null}
                  onOpenRow={onOpenRow}
                />
              </div>
            </section>
          ) : null}
        </section>
      </main>
      {newAutomationOpen && (
        <CloudNewAutomationDialog
          projectId={projectId}
          cloudSession={cloudSession}
          apiBaseUrl={apiBaseUrl}
          providers={providerSpecs}
          providersLoading={providerSpecsLoading}
          providersError={providerSpecsError}
          template={draftTemplate}
          onCloudSessionChange={onCloudSessionChange}
          onRefresh={onRefresh}
          onOpenAutomation={onOpenAutomation}
          onClose={() => setNewAutomationOpen(false)}
        />
      )}
      {detailRow && (
        <CloudManageAutomationDialog
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

function AutomationTemplateCard({
  template,
  onAdd,
}: {
  template: AutomationTemplate;
  onAdd: () => void;
}) {
  const ProviderIcon = providerIcon(template.provider);
  const iconUrl = template.iconUrl || getCloudProviderIconUrl(template.provider);

  return (
    <article className="desktop-cloud-automation-template-card">
      <div
        className="desktop-cloud-automation-template-route"
        aria-label={`${template.sourceLabel} to PuppyOne project folder`}
      >
        <span className="desktop-cloud-automation-template-mark source">
          {iconUrl ? <img src={iconUrl} alt="" /> : <ProviderIcon size={17} />}
        </span>
        <span className="desktop-cloud-automation-template-connector" aria-hidden="true">
          <span />
          <ArrowRight size={12} strokeWidth={1.8} />
        </span>
        <span className="desktop-cloud-automation-template-mark target">
          <img src="/icons/folder.svg" alt="" />
        </span>
      </div>
      <h2>{template.title}</h2>
      <p>{template.description}</p>
      <button type="button" className="desktop-cloud-automation-template-add" onClick={onAdd}>Add</button>
    </article>
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
                          <span>{lastRunLabel ? `Last run ${lastRunLabel}` : "Never run"}</span>
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
