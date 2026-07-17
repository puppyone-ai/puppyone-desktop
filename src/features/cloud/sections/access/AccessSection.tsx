import { Plus } from "lucide-react";
import { useState } from "react";
import { useLocalization } from "@puppyone/localization/react";
import type {
  DesktopCloudConnector,
  DesktopCloudMcpEndpoint,
  DesktopCloudRepoIdentity,
  DesktopCloudScope,
  DesktopCloudSession,
} from "../../../../lib/cloudApi";
import { PageLoading } from "../../../../components/loading";
import { getCloudAccessFilterPresentation, type CloudAccessFilter } from "../../accessFilters";
import type { CloudWorkspaceSection } from "../../types";
import { CloudWebEmpty } from "../../components/shared";
import { DesktopCloudScopeAccessDetail } from "./ScopeAccessDetail";
import { buildDesktopCloudAccessRows } from "./accessRows";
import { getCloudScopeRows } from "../../utils";
import { DesktopCloudCreateAccessDialog, type DesktopCloudCreateAccessCreated } from "./CreateAccessDialog";
import { repositoryTargetKey } from "../../repositoryTarget";

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
  const { t } = useLocalization();
  const scopeRows = getCloudScopeRows(scopes, identity);
  const accessRows = buildDesktopCloudAccessRows({
    scopeRows,
    connectors,
    mcpEndpoints,
    identity,
    apiBaseUrl,
  });
  const filterDescriptor = getCloudAccessFilterPresentation(filter, t);
  const pageTitle = filterDescriptor.title;
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

  return (
    <section className="desktop-cloud-access-page desktop-cloud-access-scope-page">
      <header className={`desktop-cloud-access-page-header ${sidebarOwnsHeader ? "sidebar-owned" : ""}`}>
        {!sidebarOwnsHeader && (
          <div className="desktop-cloud-access-page-title-group">
            <span className="desktop-cloud-access-page-title">{pageTitle}</span>
            <span className="desktop-cloud-access-count-badge">{loading ? 0 : scopeRows.length}</span>
          </div>
        )}
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
