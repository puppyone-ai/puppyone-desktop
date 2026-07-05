import { useEffect, useMemo, useState } from "react";
import { Filter, Search } from "lucide-react";
import {
  openCloudApp,
  type DesktopCloudConnector,
  type DesktopCloudSession,
} from "../../lib/cloudApi";
import { getCloudAccessFilterDescriptor, type CloudAccessFilter } from "./accessFilters";
import { CloudProjectBrowserSignedOut } from "./components/ProjectBrowser";
import { CloudWorkspaceLoadingState } from "./components/shared";
import type { DesktopCloudAccessDataState } from "./data/useDesktopCloudAccessData";
import { getCloudRouteWebPath } from "./routes/cloudRoutes";
import { CloudAccessSection } from "./sections/access/AccessSection";
import {
  DesktopCloudProviderIcon,
  getAccessMethodIconSize,
  getAccessMethodTileProvider,
  getDesktopCloudAccessMethodMeta,
} from "./sections/access/accessProviders";
import { isCloudAccessNavigationResource, type CloudAccessSurfaceRow } from "./sections/access/accessRows";
import type { CloudWorkspaceSection } from "./types";
import {
  formatProviderLabel,
  getCloudProviderIconUrl,
  getScopeDisplayName,
  getScopePathLabel,
  isCloudIntegrationConnector,
  isConnectorActiveStatus,
  providerIcon,
} from "./utils";

export function DesktopCloudAccessView({
  projectId,
  cloudSession,
  accessData,
  activeFilter,
  activeAccessRowId,
  activeIntegrationProvider,
  sessionRestoring,
  onCloudSessionChange,
  onRefresh,
  onSelectAccessRow,
}: {
  projectId: string | null;
  cloudSession: DesktopCloudSession | null;
  accessData: DesktopCloudAccessDataState;
  activeFilter: CloudAccessFilter;
  activeAccessRowId: string | null;
  activeIntegrationProvider?: string | null;
  sessionRestoring: boolean;
  onCloudSessionChange: (session: DesktopCloudSession | null) => void;
  onRefresh: () => void | Promise<void>;
  onSelectAccessRow?: (rowId: string | null) => void;
}) {
  const cloudApiBaseUrl = cloudSession?.api_base_url ?? null;
  const accessNavigationRows = accessData.accessRows.filter(isCloudAccessNavigationResource);
  const selectedAccessRowId = activeAccessRowId ?? accessNavigationRows[0]?.id ?? null;

  if (sessionRestoring && !cloudSession) {
    return (
      <div className="desktop-cloud-main-view">
        <div className="desktop-cloud-page-shell">
          <CloudWorkspaceLoadingState label="Loading Cloud session" />
        </div>
      </div>
    );
  }

  if (!cloudSession) {
    return (
      <div className="desktop-cloud-main-view desktop-cloud-auth-main-view">
        <div className="desktop-cloud-page-shell">
          <CloudProjectBrowserSignedOut
            apiBaseUrl={cloudApiBaseUrl}
            accountEmail={null}
            onSignedIn={onCloudSessionChange}
            onSignedOut={() => onCloudSessionChange(null)}
            onRefresh={onRefresh}
          />
        </div>
      </div>
    );
  }

  if (!projectId) {
    return (
      <div className="desktop-cloud-main-view">
        <div className="desktop-cloud-page-shell">
          <div className="desktop-cloud-main-alert">No Cloud project is active.</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`desktop-cloud-main-view desktop-cloud-access-main-view ${activeFilter === "integrations" ? "desktop-cloud-integrations-main-view" : ""}`}>
      <div className={`desktop-cloud-page-shell desktop-cloud-access-page-shell ${activeFilter === "integrations" ? "desktop-cloud-integrations-page-shell" : ""}`}>
        {accessData.error && <div className="desktop-cloud-main-alert">{accessData.error}</div>}
        {accessData.warning && <div className="desktop-cloud-main-alert">{accessData.warning}</div>}
        <CloudAccessSection
          projectId={projectId}
          cloudSession={cloudSession}
          apiBaseUrl={cloudApiBaseUrl}
          identity={accessData.identity}
          scopes={accessData.scopeRows}
          connectors={accessData.connectors}
          connectorsByScope={accessData.connectorsByScope}
          mcpEndpoints={accessData.mcpEndpoints}
          mcpEndpointsByScope={accessData.mcpEndpointsByScope}
          filter={activeFilter}
          activeAccessRowId={selectedAccessRowId}
          integrationProviderFilter={activeIntegrationProvider ?? null}
          loading={accessData.loading}
          onCloudSessionChange={onCloudSessionChange}
          onRefresh={accessData.reload}
          onSelectAccessRow={onSelectAccessRow}
          onOpenProject={handleOpenProject}
          onOpenIntegrations={handleOpenIntegrations}
          sidebarOwnsHeader={activeFilter === "all"}
        />
      </div>
    </div>
  );
}

export function DesktopCloudAccessSidebar({
  accessData,
  activeAccessRowId,
  onSelectAccessRow,
}: {
  accessData: DesktopCloudAccessDataState;
  activeAccessRowId: string | null;
  onSelectAccessRow: (rowId: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const resourceRows = useMemo(
    () => accessData.accessRows.filter(isCloudAccessNavigationResource),
    [accessData.accessRows],
  );
  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return resourceRows.filter((row) => {
      const meta = getDesktopCloudAccessMethodMeta(row.surface);
      const active = isConnectorActiveStatus(row.surface.status);
      if (filter === "active" && !active) return false;
      if (filter === "inactive" && active) return false;
      if (!normalizedQuery) return true;
      return `${meta.title} ${row.surface.title} ${row.surface.provider} ${getScopeDisplayName(row.scope)} ${getScopePathLabel(row.scope)} ${row.scope.path ?? ""}`
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [filter, query, resourceRows]);
  const selectedAccessRowId = activeAccessRowId ?? resourceRows[0]?.id ?? null;

  return (
    <section className="desktop-tool-sidebar desktop-cloud-service-sidebar desktop-cloud-access-scope-sidebar">
      <div className="desktop-cloud-access-sidebar-page-header">
        <div className="desktop-cloud-access-page-title-group">
          <span className="desktop-cloud-access-page-title">Access</span>
          <span className="desktop-cloud-access-count-badge">{accessData.loading ? 0 : resourceRows.length}</span>
        </div>
      </div>
      <div className="desktop-cloud-access-scope-sidebar-toolbar">
        <label className="desktop-cloud-access-scope-search">
          <Search size={14} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search access"
          />
        </label>
        <div className="desktop-cloud-access-filter-wrap">
          <button
            className={`desktop-cloud-access-filter-button ${filter !== "all" || filterOpen ? "active" : ""}`}
            type="button"
            aria-label="Filter access"
            aria-expanded={filterOpen}
            onClick={() => setFilterOpen((open) => !open)}
          >
            <Filter size={14} />
          </button>
          {filterOpen && (
            <div className="desktop-cloud-access-filter-menu">
              {(["all", "active", "inactive"] as const).map((item) => (
                <button
                  key={item}
                  className={filter === item ? "active" : ""}
                  type="button"
                  onClick={() => {
                    setFilter(item);
                    setFilterOpen(false);
                  }}
                >
                  <span>{item === "all" ? "All access" : item === "active" ? "Active" : "Inactive"}</span>
                  {filter === item && <span aria-hidden="true">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="desktop-tool-sidebar-list desktop-cloud-sidebar-list desktop-cloud-access-scope-list" role="listbox" aria-label="Cloud access resources">
        {accessData.loading && filteredRows.length === 0 ? (
          <div className="desktop-cloud-access-scope-empty">Loading access</div>
        ) : filteredRows.length === 0 ? (
          <div className="desktop-cloud-access-scope-empty">No matching access.</div>
        ) : filteredRows.map((row) => (
          <DesktopCloudAccessResourceRow
            key={row.id}
            row={row}
            selected={row.id === selectedAccessRowId}
            onSelect={() => onSelectAccessRow(row.id)}
          />
        ))}
      </div>
    </section>
  );
}

export function DesktopCloudIntegrationsSidebar({
  accessData,
  activeProvider,
  onSelectProvider,
}: {
  accessData: DesktopCloudAccessDataState;
  activeProvider: string | null;
  onSelectProvider: (provider: string | null) => void;
}) {
  const integrations = getCloudAccessFilterDescriptor("integrations");
  const IntegrationsIcon = integrations.icon;
  const integrationConnectors = accessData.connectors.filter(isCloudIntegrationConnector);
  const providerGroups = getIntegrationSidebarProviderGroups(integrationConnectors);
  const providerKey = providerGroups.map((group) => group.provider).join("|");

  useEffect(() => {
    if (activeProvider && !providerKey.split("|").includes(activeProvider)) {
      onSelectProvider(null);
    }
  }, [activeProvider, onSelectProvider, providerKey]);

  return (
    <section className="desktop-tool-sidebar desktop-cloud-service-sidebar desktop-cloud-integrations-type-sidebar">
      <div className="desktop-tool-sidebar-list desktop-cloud-sidebar-list">
        <nav className="desktop-cloud-sidebar-nav" aria-label="Cloud integrations">
          <button
            className={`desktop-tool-sidebar-row desktop-cloud-sidebar-nav-row ${activeProvider ? "" : "active"}`}
            type="button"
            aria-current={activeProvider ? undefined : "page"}
            onClick={() => onSelectProvider(null)}
          >
            <span className="desktop-cloud-sidebar-nav-icon">
              <IntegrationsIcon size={15} />
            </span>
            <span className="desktop-cloud-sidebar-nav-label">All Integrations</span>
            {integrationConnectors.length > 0 && (
              <span className="desktop-cloud-sidebar-nav-count">{integrationConnectors.length}</span>
            )}
          </button>
          <div className="desktop-cloud-integrations-nav-group">
            {providerGroups.map((group) => {
              const Icon = providerIcon(group.provider);
              const iconUrl = getCloudProviderIconUrl(group.provider);
              const active = activeProvider === group.provider;
              return (
                <button
                  className={`desktop-tool-sidebar-row desktop-cloud-sidebar-nav-row desktop-cloud-integrations-provider-row ${active ? "active" : ""}`}
                  key={group.provider}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  title={group.label}
                  onClick={() => onSelectProvider(group.provider)}
                >
                  <span className="desktop-cloud-sidebar-nav-icon">
                    {iconUrl ? <img src={iconUrl} alt="" /> : <Icon size={14} />}
                  </span>
                  <span className="desktop-cloud-sidebar-nav-label">{group.label}</span>
                  <span className="desktop-cloud-sidebar-nav-count">{group.connectors.length}</span>
                </button>
              );
            })}
            {accessData.loading && providerGroups.length === 0 && (
              <div className="desktop-cloud-integrations-nav-empty" role="status">Loading integrations</div>
            )}
            {!accessData.loading && accessData.error && (
              <div className="desktop-cloud-integrations-nav-empty" role="status">{accessData.error}</div>
            )}
            {!accessData.loading && !accessData.error && providerGroups.length === 0 && (
              <div className="desktop-cloud-integrations-nav-empty">No active integrations</div>
            )}
          </div>
        </nav>
      </div>
    </section>
  );
}

function DesktopCloudAccessResourceRow({
  row,
  selected,
  onSelect,
}: {
  row: CloudAccessSurfaceRow;
  selected: boolean;
  onSelect: () => void;
}) {
  const meta = getDesktopCloudAccessMethodMeta(row.surface);
  const scopePath = getScopePathLabel(row.scope);
  const active = isConnectorActiveStatus(row.surface.status);
  const tileProvider = getAccessMethodTileProvider(row.surface.provider);
  const iconSize = getAccessMethodIconSize(row.surface.provider);

  return (
    <button
      className={`desktop-cloud-access-scope-row desktop-cloud-access-resource-row ${selected ? "active" : ""}`}
      type="button"
      role="option"
      aria-selected={selected}
      title={`${meta.title} · ${getScopeDisplayName(row.scope)} · ${scopePath}`}
      onClick={onSelect}
    >
      <span className={`desktop-cloud-access-resource-icon ${tileProvider}`} aria-hidden="true">
        <DesktopCloudProviderIcon provider={row.surface.provider} size={iconSize === 34 ? 18 : iconSize} />
      </span>
      <span className="desktop-cloud-access-scope-row-content">
        <span className="desktop-cloud-access-scope-title-line">
          <span className={`desktop-cloud-access-scope-status ${active ? "active" : ""}`} aria-hidden="true" />
          <span className="desktop-cloud-access-scope-name">{meta.title}</span>
          <code className="desktop-cloud-access-resource-path" title={scopePath}>{scopePath}</code>
        </span>
      </span>
    </button>
  );
}

function getIntegrationSidebarProviderGroups(connectors: DesktopCloudConnector[]) {
  const groups = new Map<string, {
    provider: string;
    label: string;
    connectors: DesktopCloudConnector[];
  }>();

  for (const connector of connectors) {
    const group = groups.get(connector.provider) ?? {
      provider: connector.provider,
      label: formatProviderLabel(connector.provider),
      connectors: [],
    };
    group.connectors.push(connector);
    groups.set(connector.provider, group);
  }

  return [...groups.values()].sort((left, right) => left.label.localeCompare(right.label));
}

function handleOpenProject(projectId: string, section: CloudWorkspaceSection = "access") {
  openCloudApp(getCloudRouteWebPath(section, projectId));
}

function handleOpenIntegrations(projectId: string) {
  openCloudApp(`/projects/${encodeURIComponent(projectId)}/workflows`);
}
