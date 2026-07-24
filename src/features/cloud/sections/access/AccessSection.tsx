import { ChevronRight, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { bidiIsolate } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import "./access.css";
import type {
  DesktopCloudConnector,
  DesktopCloudMcpEndpoint,
  DesktopCloudRepoIdentity,
  DesktopCloudScope,
  DesktopCloudSession,
} from "../../../../lib/cloudApi";
import {
  DesktopDialogCloseButton,
  DesktopDialogRoot,
  DesktopDialogSurface,
} from "../../../../components/DesktopDialog";
import { PageLoading } from "../../../../components/loading";
import {
  CLOUD_ACCESS_FILTERS,
  getCloudAccessFilterPresentation,
  type CloudAccessFilter,
} from "../../accessFilters";
import type { CloudWorkspaceSection } from "../../types";
import { CloudWebEmpty } from "../../components/shared";
import { formatCloudAccessSurfaceTitle } from "../../cloudPresentation";
import {
  formatStatusLabel,
  getCloudScopeRows,
  getScopeDisplayName,
  getScopePathLabel,
  isConnectorActiveStatus,
} from "../../utils";
import { DesktopCloudScopeAccessDetail } from "./ScopeAccessDetail";
import {
  buildDesktopCloudAccessRows,
  cloudAccessRowMatchesFilter,
  type CloudAccessSurfaceRow,
} from "./accessRows";
import {
  DesktopCloudProviderIcon,
  getAccessMethodIconSize,
  getAccessMethodTileProvider,
} from "./accessProviders";
import { DesktopCloudCreateAccessDialog, type DesktopCloudCreateAccessCreated } from "./CreateAccessDialog";
import { repositoryTargetKey } from "../../repositoryTarget";

type CloudAccessStatusFilter = "all" | "active" | "inactive";

export function CloudAccessSection({
  projectId,
  cloudSession,
  apiBaseUrl,
  identity,
  scopes,
  connectors,
  connectorsByTarget,
  mcpEndpoints,
  mcpEndpointsByTarget,
  filter = "all",
  activeAccessRowId,
  loading,
  onCloudSessionChange,
  onRefresh,
  onSelectAccessRow,
  onOpenProject,
  sidebarOwnsHeader = false,
  canManage = false,
}: {
  projectId: string;
  cloudSession: DesktopCloudSession;
  apiBaseUrl: string | null;
  identity: DesktopCloudRepoIdentity | null;
  scopes: DesktopCloudScope[];
  connectors: DesktopCloudConnector[];
  connectorsByTarget: Map<string, DesktopCloudConnector[]>;
  mcpEndpoints: DesktopCloudMcpEndpoint[];
  mcpEndpointsByTarget: Map<string, DesktopCloudMcpEndpoint[]>;
  filter?: CloudAccessFilter;
  activeAccessRowId: string | null;
  loading: boolean;
  onCloudSessionChange: (session: DesktopCloudSession | null) => void;
  onRefresh: () => Promise<void>;
  onSelectAccessRow?: (rowId: string | null) => void;
  onOpenProject: (projectId: string, section?: CloudWorkspaceSection) => void;
  sidebarOwnsHeader?: boolean;
  canManage?: boolean;
}) {
  const localization = useLocalization();
  const { locale, t } = localization;
  const scopeRows = useMemo(() => getCloudScopeRows(scopes, identity), [identity, scopes]);
  const accessRows = useMemo(() => buildDesktopCloudAccessRows({
    scopeRows,
    connectors,
    mcpEndpoints,
    identity,
    apiBaseUrl,
  }), [apiBaseUrl, connectors, identity, mcpEndpoints, scopeRows]);
  const [createAccessOpen, setCreateAccessOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<CloudAccessFilter>(filter);
  const [statusFilter, setStatusFilter] = useState<CloudAccessStatusFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedCatalogRowId, setSelectedCatalogRowId] = useState<string | null>(activeAccessRowId);

  useEffect(() => setActiveFilter(filter), [filter]);
  useEffect(() => {
    if (activeAccessRowId) setSelectedCatalogRowId(activeAccessRowId);
  }, [activeAccessRowId]);

  const visibleAccessRows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase(locale);
    return accessRows.filter((row) => {
      if (!cloudAccessRowMatchesFilter(row, activeFilter)) return false;
      const active = isConnectorActiveStatus(row.surface.status);
      if (statusFilter === "active" && !active) return false;
      if (statusFilter === "inactive" && active) return false;
      if (!normalizedQuery) return true;
      return [
        formatCloudAccessSurfaceTitle(row.surface, t),
        row.surface.title,
        row.surface.provider,
        getScopeDisplayName(row.scope, t),
        getScopePathLabel(row.scope),
      ].join(" ").toLocaleLowerCase(locale).includes(normalizedQuery);
    });
  }, [accessRows, activeFilter, locale, query, statusFilter, t]);

  const filterDescriptor = getCloudAccessFilterPresentation(activeFilter, t);
  const selectedCatalogRow = accessRows.find((row) => row.id === selectedCatalogRowId) ?? null;
  const handleAccessCreated = async (created: DesktopCloudCreateAccessCreated) => {
    await onRefresh();
    setSelectedCatalogRowId(created.preferredRowId);
    onSelectAccessRow?.(created.preferredRowId);
  };
  const closeCatalogDetail = () => {
    setSelectedCatalogRowId(null);
    onSelectAccessRow?.(null);
  };

  if (sidebarOwnsHeader) {
    const legacyDescriptor = getCloudAccessFilterPresentation(filter, t);
    const selectedAccessRow = accessRows.find((row) => row.id === activeAccessRowId) ?? accessRows[0] ?? null;
    const selectedScope = selectedAccessRow?.scope ?? scopeRows[0] ?? null;
    const selectedSurfaceId = selectedAccessRow && selectedAccessRow.scope.id === selectedScope?.id
      ? selectedAccessRow.surface.id
      : null;

    return (
      <section className="desktop-cloud-access-page desktop-cloud-access-scope-page">
        <header className="desktop-cloud-access-page-header sidebar-owned">
          {canManage && (
            <button className="desktop-cloud-access-header-action" type="button" onClick={() => setCreateAccessOpen(true)}>
              <Plus size={14} />
              <span>{t("cloud.access.new")}</span>
            </button>
          )}
        </header>
        {loading ? (
          <PageLoading variant="fill" label={t("cloud.common.loading")} className="desktop-cloud-web-loading" />
        ) : scopeRows.length === 0 ? (
          <CloudWebEmpty
            icon={legacyDescriptor.icon}
            title={legacyDescriptor.emptyTitle}
            detail={legacyDescriptor.emptyDetail}
          />
        ) : selectedScope ? (
          <div className="desktop-cloud-access-detail">
            <DesktopCloudScopeAccessDetail
              projectId={projectId}
              cloudSession={cloudSession}
              onCloudSessionChange={onCloudSessionChange}
              apiBaseUrl={apiBaseUrl}
              scope={selectedScope}
              activeSurfaceId={selectedSurfaceId}
              identity={identity}
              connectors={connectorsByTarget.get(repositoryTargetKey(selectedScope.target)) ?? []}
              mcpEndpoints={mcpEndpointsByTarget.get(repositoryTargetKey(selectedScope.target)) ?? []}
              onRefresh={onRefresh}
              canManage={canManage}
            />
          </div>
        ) : (
          <div className="desktop-cloud-access-detail" />
        )}
        {canManage && createAccessOpen && (
          <DesktopCloudCreateAccessDialog
            projectId={projectId}
            cloudSession={cloudSession}
            apiBaseUrl={apiBaseUrl}
            scopes={scopeRows}
            connectorsByTarget={connectorsByTarget}
            mcpEndpointsByTarget={mcpEndpointsByTarget}
            onCloudSessionChange={onCloudSessionChange}
            onClose={() => setCreateAccessOpen(false)}
            onCreated={handleAccessCreated}
          />
        )}
      </section>
    );
  }

  const noMatches = Boolean(query.trim()) || statusFilter !== "all";
  const emptyTitle = noMatches ? t("cloud.access.noMatches") : filterDescriptor.emptyTitle;
  const emptyDetail = noMatches ? filterDescriptor.description : filterDescriptor.emptyDetail;

  return (
    <section className="desktop-cloud-access-page desktop-cloud-access-catalog-page">
      <main className="desktop-cloud-access-canvas">
        <div className="desktop-cloud-access-catalog">
          <header className="desktop-cloud-access-landing-header">
            <div className="desktop-cloud-access-landing-copy">
              <h1>{t("cloud.access.resources")}</h1>
              <p>{t("cloud.route.access.description")}</p>
            </div>
            {canManage && (
              <button className="desktop-cloud-access-new-button" type="button" onClick={() => setCreateAccessOpen(true)}>
                <Plus size={14} />
                <span>{t("cloud.access.new")}</span>
              </button>
            )}
          </header>

          <div className="desktop-cloud-access-toolbar">
            <nav className="desktop-cloud-access-category-tabs" aria-label={t("cloud.access.filterAria")} role="tablist">
              {CLOUD_ACCESS_FILTERS.map((item) => {
                const presentation = getCloudAccessFilterPresentation(item.id, t);
                const active = activeFilter === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={active ? "active" : undefined}
                    onClick={() => setActiveFilter(item.id)}
                  >
                    {presentation.label}
                  </button>
                );
              })}
            </nav>
            <div className="desktop-cloud-access-filter-controls">
              <label className="desktop-cloud-access-catalog-search">
                <Search size={14} aria-hidden="true" />
                <input
                  value={query}
                  aria-label={t("cloud.access.search")}
                  placeholder={t("cloud.access.search")}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <select
                className="desktop-cloud-access-status-filter"
                value={statusFilter}
                aria-label={t("cloud.access.filterAria")}
                onChange={(event) => setStatusFilter(event.target.value as CloudAccessStatusFilter)}
              >
                {(["all", "active", "inactive"] as const).map((status) => (
                  <option key={status} value={status}>{t(`cloud.access.filterState.${status}`)}</option>
                ))}
              </select>
            </div>
          </div>

          <section className="desktop-cloud-access-list-section" aria-label={t("cloud.access.resources")}>
            {loading && accessRows.length === 0 ? (
              <div className="desktop-cloud-access-point-list" aria-hidden="true">
                {Array.from({ length: 4 }, (_, index) => (
                  <div className="desktop-cloud-access-point-row skeleton" key={index}>
                    <span />
                    <span />
                    <span />
                  </div>
                ))}
              </div>
            ) : visibleAccessRows.length > 0 ? (
              <div className="desktop-cloud-access-point-list">
                {visibleAccessRows.map((row) => (
                  <CloudAccessPointRow
                    key={row.id}
                    row={row}
                    selected={row.id === selectedCatalogRowId}
                    onOpen={() => {
                      setSelectedCatalogRowId(row.id);
                      onSelectAccessRow?.(row.id);
                    }}
                  />
                ))}
              </div>
            ) : (
              <CloudWebEmpty icon={filterDescriptor.icon} title={emptyTitle} detail={emptyDetail} />
            )}
          </section>
        </div>
      </main>

      {selectedCatalogRow && (
        <DesktopDialogRoot onClose={closeCatalogDetail}>
          <DesktopDialogSurface
            width={920}
            className="desktop-cloud-access-manage-dialog"
            ariaLabel={formatCloudAccessSurfaceTitle(selectedCatalogRow.surface, t)}
          >
            <header className="desktop-dialog-header desktop-cloud-access-manage-header">
              <div className="desktop-dialog-title-row">
                <div>
                  <h2>{formatCloudAccessSurfaceTitle(selectedCatalogRow.surface, t)}</h2>
                  <p>{bidiIsolate(`${getScopeDisplayName(selectedCatalogRow.scope, t)} · ${getScopePathLabel(selectedCatalogRow.scope)}`)}</p>
                </div>
              </div>
              <DesktopDialogCloseButton title={t("cloud.common.close")} onClick={closeCatalogDetail} />
            </header>
            <div className="desktop-dialog-body desktop-cloud-access-manage-body">
              <DesktopCloudScopeAccessDetail
                projectId={projectId}
                cloudSession={cloudSession}
                onCloudSessionChange={onCloudSessionChange}
                apiBaseUrl={apiBaseUrl}
                scope={selectedCatalogRow.scope}
                activeSurfaceId={selectedCatalogRow.surface.id}
                identity={identity}
                connectors={connectorsByTarget.get(repositoryTargetKey(selectedCatalogRow.scope.target)) ?? []}
                mcpEndpoints={mcpEndpointsByTarget.get(repositoryTargetKey(selectedCatalogRow.scope.target)) ?? []}
                onRefresh={onRefresh}
                canManage={canManage}
              />
            </div>
          </DesktopDialogSurface>
        </DesktopDialogRoot>
      )}

      {canManage && createAccessOpen && (
        <DesktopCloudCreateAccessDialog
          projectId={projectId}
          cloudSession={cloudSession}
          apiBaseUrl={apiBaseUrl}
          scopes={scopeRows}
          connectorsByTarget={connectorsByTarget}
          mcpEndpointsByTarget={mcpEndpointsByTarget}
          onCloudSessionChange={onCloudSessionChange}
          onClose={() => setCreateAccessOpen(false)}
          onCreated={handleAccessCreated}
        />
      )}
    </section>
  );
}

function CloudAccessPointRow({
  row,
  selected,
  onOpen,
}: {
  row: CloudAccessSurfaceRow;
  selected: boolean;
  onOpen: () => void;
}) {
  const { t } = useLocalization();
  const title = formatCloudAccessSurfaceTitle(row.surface, t);
  const scopeName = getScopeDisplayName(row.scope, t);
  const scopePath = getScopePathLabel(row.scope);
  const active = isConnectorActiveStatus(row.surface.status);
  const error = row.surface.status === "error";
  const tileProvider = getAccessMethodTileProvider(row.surface.provider);
  const iconSize = getAccessMethodIconSize(row.surface.provider);
  const modeLabel = t(row.scope.max_mode === "rw" ? "cloud.scope.readWrite" : "cloud.scope.readOnly");

  return (
    <button
      className={`desktop-cloud-access-point-row ${selected ? "selected" : ""}`}
      type="button"
      title={`${title} · ${bidiIsolate(scopeName)} · ${bidiIsolate(scopePath)}`}
      onClick={onOpen}
    >
      <span className={`desktop-cloud-access-point-icon ${tileProvider}`} aria-hidden="true">
        <DesktopCloudProviderIcon provider={row.surface.provider} size={iconSize === 34 ? 18 : iconSize} />
      </span>
      <span className="desktop-cloud-access-point-copy">
        <strong dir="auto">{title}</strong>
        <span>
          <span dir="auto">{scopeName}</span>
          <code title={scopePath}>{scopePath}</code>
        </span>
      </span>
      <span className="desktop-cloud-access-point-right">
        <span className="desktop-cloud-access-point-meta">
          <span className={`desktop-cloud-access-point-status ${active ? "success" : error ? "danger" : "muted"}`}>
            <span aria-hidden="true" />
            {formatStatusLabel(row.surface.status, t)}
          </span>
          <span>{modeLabel}</span>
        </span>
        <span className="desktop-cloud-access-point-manage">
          {t("cloud.access.open")}
          <ChevronRight className="po-directional-icon" size={13} />
        </span>
      </span>
    </button>
  );
}
