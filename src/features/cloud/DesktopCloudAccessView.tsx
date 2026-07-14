import { useMemo, useState } from "react";
import { Filter, Search } from "lucide-react";
import { bidiIsolate } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import { SidebarRoot, SidebarScrollArea } from "@puppyone/shared-ui";
import {
  openCloudApp,
  type DesktopCloudSession,
} from "../../lib/cloudApi";
import type { CloudAccessFilter } from "./accessFilters";
import { CloudProjectBrowserSignedOut } from "./components/ProjectBrowser";
import { CloudWorkspaceLoadingState } from "./components/shared";
import type { DesktopCloudAccessDataState } from "./data/useDesktopCloudAccessData";
import { getCloudRouteWebPath } from "./routes/cloudRoutes";
import { formatCloudMessage } from "./cloudPresentation";
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
  getScopeDisplayName,
  getScopePathLabel,
  isConnectorActiveStatus,
} from "./utils";

export function DesktopCloudAccessView({
  projectId,
  cloudSession,
  accessData,
  activeFilter,
  activeAccessRowId,
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
  sessionRestoring: boolean;
  onCloudSessionChange: (session: DesktopCloudSession | null) => void;
  onRefresh: () => void | Promise<void>;
  onSelectAccessRow?: (rowId: string | null) => void;
}) {
  const { t } = useLocalization();
  const cloudApiBaseUrl = cloudSession?.api_base_url ?? null;
  const accessNavigationRows = accessData.accessRows.filter(isCloudAccessNavigationResource);
  const selectedAccessRowId = activeAccessRowId ?? accessNavigationRows[0]?.id ?? null;

  if (sessionRestoring && !cloudSession) {
    return (
      <div className="desktop-cloud-main-view">
        <div className="desktop-cloud-page-shell">
          <CloudWorkspaceLoadingState label={t("cloud.loading.session")} />
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
          <div className="desktop-cloud-main-alert">{t("cloud.project.noneActive")}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="desktop-cloud-main-view desktop-cloud-access-main-view">
      <div className="desktop-cloud-page-shell desktop-cloud-access-page-shell">
        {accessData.error && <div className="desktop-cloud-main-alert">{formatCloudMessage(accessData.error, t)}</div>}
        {accessData.warning && <div className="desktop-cloud-main-alert">{formatCloudMessage(accessData.warning, t)}</div>}
        <CloudAccessSection
          projectId={projectId}
          cloudSession={cloudSession}
          apiBaseUrl={cloudApiBaseUrl}
          identity={accessData.identity}
          scopes={accessData.scopeRows}
          connectors={accessData.connectors}
          connectorsByTarget={accessData.connectorsByTarget}
          mcpEndpoints={accessData.mcpEndpoints}
          mcpEndpointsByTarget={accessData.mcpEndpointsByTarget}
          filter={activeFilter}
          activeAccessRowId={selectedAccessRowId}
          loading={accessData.loading}
          onCloudSessionChange={onCloudSessionChange}
          onRefresh={accessData.reload}
          onSelectAccessRow={onSelectAccessRow}
          onOpenProject={handleOpenProject}
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
  const localization = useLocalization();
  const { formatNumber, locale, t } = localization;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const resourceRows = useMemo(
    () => accessData.accessRows.filter(isCloudAccessNavigationResource),
    [accessData.accessRows],
  );
  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase(locale);
    return resourceRows.filter((row) => {
      const meta = getDesktopCloudAccessMethodMeta(row.surface, t);
      const active = isConnectorActiveStatus(row.surface.status);
      if (filter === "active" && !active) return false;
      if (filter === "inactive" && active) return false;
      if (!normalizedQuery) return true;
      return `${meta.title} ${row.surface.title} ${row.surface.provider} ${getScopeDisplayName(row.scope, t)} ${getScopePathLabel(row.scope)} ${row.scope.path ?? ""}`
        .toLocaleLowerCase(locale)
        .includes(normalizedQuery);
    });
  }, [filter, locale, query, resourceRows, t]);
  const selectedAccessRowId = activeAccessRowId ?? resourceRows[0]?.id ?? null;

  return (
    <SidebarRoot className="desktop-cloud-service-sidebar desktop-cloud-access-scope-sidebar">
      <div className="desktop-cloud-access-sidebar-page-header">
        <div className="desktop-cloud-access-page-title-group">
          <span className="desktop-cloud-access-page-title">{t("cloud.route.access.title")}</span>
          <span className="desktop-cloud-access-count-badge">{formatNumber(accessData.loading ? 0 : resourceRows.length)}</span>
        </div>
      </div>
      <div className="desktop-cloud-access-scope-sidebar-toolbar">
        <label className="desktop-cloud-access-scope-search">
          <Search size={14} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("cloud.access.search")}
          />
        </label>
        <div className="desktop-cloud-access-filter-wrap">
          <button
            className={`desktop-cloud-access-filter-button ${filter !== "all" || filterOpen ? "active" : ""}`}
            type="button"
            aria-label={t("cloud.access.filterAria")}
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
                  <span>{t(`cloud.access.filterState.${item}`)}</span>
                  {filter === item && <span aria-hidden="true">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <SidebarScrollArea className="desktop-cloud-sidebar-list desktop-cloud-access-scope-list" role="listbox" aria-label={t("cloud.access.resources")}>
        {accessData.loading && filteredRows.length === 0 ? (
          <div className="desktop-cloud-access-scope-empty">{t("cloud.access.loading")}</div>
        ) : filteredRows.length === 0 ? (
          <div className="desktop-cloud-access-scope-empty">{t("cloud.access.noMatches")}</div>
        ) : filteredRows.map((row) => (
          <DesktopCloudAccessResourceRow
            key={row.id}
            row={row}
            selected={row.id === selectedAccessRowId}
            onSelect={() => onSelectAccessRow(row.id)}
          />
        ))}
      </SidebarScrollArea>
    </SidebarRoot>
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
  const { t } = useLocalization();
  const meta = getDesktopCloudAccessMethodMeta(row.surface, t);
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
      title={`${meta.title} · ${bidiIsolate(getScopeDisplayName(row.scope, t))} · ${bidiIsolate(scopePath)}`}
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

function handleOpenProject(projectId: string, section: CloudWorkspaceSection = "access") {
  openCloudApp(getCloudRouteWebPath(section, projectId));
}
