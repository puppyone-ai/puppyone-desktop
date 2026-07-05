import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  DesktopCloudConnector,
  DesktopCloudMcpEndpoint,
  DesktopCloudRepoIdentity,
  DesktopCloudScope,
  DesktopCloudSession,
} from "../../../../lib/cloudApi";
import { PageLoading } from "../../../../components/loading";
import { getCloudAccessFilterDescriptor, type CloudAccessFilter } from "../../accessFilters";
import type { CloudWorkspaceSection } from "../../types";
import { CloudWebEmpty } from "../../components/shared";
import { CloudIntegrationsPage } from "./IntegrationsPage";
import { DesktopCloudScopeAccessDetail } from "./ScopeAccessDetail";
import {
  buildDesktopCloudAccessRows,
  cloudAccessRowMatchesFilter,
  cloudAccessRowMatchesIntegrationProvider,
  type CloudAccessSurfaceRow,
} from "./accessRows";
import {
  formatProviderLabel,
  getCloudScopeRows,
} from "../../utils";
import { DesktopCloudCreateAccessDialog, type DesktopCloudCreateAccessCreated } from "./CreateAccessDialog";

export function CloudAccessSection({
  projectId,
  cloudSession,
  apiBaseUrl,
  identity,
  scopes,
  connectors,
  connectorsByScope,
  mcpEndpoints,
  mcpEndpointsByScope,
  filter = "all",
  activeAccessRowId,
  integrationProviderFilter = null,
  loading,
  onCloudSessionChange,
  onRefresh,
  onSelectAccessRow,
  onOpenProject,
  onOpenIntegrations,
  sidebarOwnsHeader = false,
}: {
  projectId: string;
  cloudSession: DesktopCloudSession;
  apiBaseUrl: string | null;
  identity: DesktopCloudRepoIdentity | null;
  scopes: DesktopCloudScope[];
  connectors: DesktopCloudConnector[];
  connectorsByScope: Map<string, DesktopCloudConnector[]>;
  mcpEndpoints: DesktopCloudMcpEndpoint[];
  mcpEndpointsByScope: Map<string, DesktopCloudMcpEndpoint[]>;
  filter?: CloudAccessFilter;
  activeAccessRowId: string | null;
  integrationProviderFilter?: string | null;
  loading: boolean;
  onCloudSessionChange: (session: DesktopCloudSession | null) => void;
  onRefresh: () => Promise<void>;
  onSelectAccessRow?: (rowId: string | null) => void;
  onOpenProject: (projectId: string, section?: CloudWorkspaceSection) => void;
  onOpenIntegrations?: (projectId: string) => void;
  sidebarOwnsHeader?: boolean;
}) {
  const scopeRows = getCloudScopeRows(scopes, identity);
  const scopeKey = scopeRows.map((scope) => scope.id).join("|");
  const accessRows = buildDesktopCloudAccessRows({
    scopeRows,
    connectors,
    mcpEndpoints,
    identity,
    apiBaseUrl,
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
  const selectedAccessRow = accessRows.find((row) => row.id === activeAccessRowId) ?? accessRows[0] ?? null;
  const selectedScope = selectedAccessRow?.scope ?? scopeRows[0] ?? null;
  const selectedSurfaceId = selectedAccessRow && selectedAccessRow.scope.id === selectedScope?.id
    ? selectedAccessRow.surface.id
    : null;
  const [createAccessOpen, setCreateAccessOpen] = useState(false);
  const handleAccessCreated = async (created: DesktopCloudCreateAccessCreated) => {
    await onRefresh();
    onSelectAccessRow?.(created.preferredRowId);
  };

  if (filter === "integrations") {
    return (
      <CloudIntegrationsPage
        projectId={projectId}
        cloudSession={cloudSession}
        apiBaseUrl={apiBaseUrl}
        rows={visibleRows}
        totalCount={integrationProviderFilter ? visibleRows.length : integrationRows.length}
        loading={loading}
        detailRow={detailRow}
        onOpenRow={(rowId) => setDetailRowId(rowId)}
        onCloseDetail={() => setDetailRowId(null)}
        onCloudSessionChange={onCloudSessionChange}
        onRefresh={onRefresh}
        onOpenAccess={() => onOpenProject(projectId, "access")}
        onOpenIntegrations={() => {
          if (onOpenIntegrations) onOpenIntegrations(projectId);
          else onOpenProject(projectId, "integrations");
        }}
      />
    );
  }

  return (
    <section className="desktop-cloud-access-page desktop-cloud-access-scope-page">
      <header className={`desktop-cloud-access-page-header ${sidebarOwnsHeader ? "sidebar-owned" : ""}`}>
        {!sidebarOwnsHeader && (
          <div className="desktop-cloud-access-page-title-group">
            <span className="desktop-cloud-access-page-title">{pageTitle}</span>
            <span className="desktop-cloud-access-count-badge">{loading ? 0 : scopeRows.length}</span>
          </div>
        )}
        <button className="desktop-cloud-access-header-action" type="button" onClick={() => setCreateAccessOpen(true)}>
          <Plus size={14} />
          <span>New access</span>
        </button>
      </header>
      {loading ? (
        <PageLoading variant="fill" label="Loading" className="desktop-cloud-web-loading" />
      ) : scopeRows.length === 0 ? (
        <CloudWebEmpty
          icon={filterDescriptor.icon}
          title={filterDescriptor.emptyTitle}
          detail={filterDescriptor.emptyDetail}
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
            connectors={connectorsByScope.get(selectedScope.id) ?? []}
            mcpEndpoints={mcpEndpointsByScope.get(selectedScope.id) ?? []}
            onRefresh={onRefresh}
          />
        </div>
      ) : (
        <div className="desktop-cloud-access-detail" />
      )}
      {createAccessOpen && (
        <DesktopCloudCreateAccessDialog
          projectId={projectId}
          cloudSession={cloudSession}
          apiBaseUrl={apiBaseUrl}
          scopes={scopeRows}
          connectorsByScope={connectorsByScope}
          mcpEndpointsByScope={mcpEndpointsByScope}
          onCloudSessionChange={onCloudSessionChange}
          onClose={() => setCreateAccessOpen(false)}
          onCreated={handleAccessCreated}
        />
      )}
    </section>
  );
}
