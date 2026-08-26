import { Users } from "lucide-react";
import { useLocalization } from "@puppyone/localization/react";
import type { Workspace } from "@puppyone/shared-ui";
import type {
  DesktopCloudProject,
  DesktopCloudSession,
} from "../../../lib/cloudApi";
import type { GitStatusSnapshot } from "../../../types/electron";
import type { DesktopCloudDataState } from "../data";
import type { CloudWorkspaceSection } from "../types";
import { CloudWorkspaceLoadingState } from "../components/shared";
import { CloudAutomationRouteSection } from "../sections/AutomationRouteSection";
import { CloudBranchesSection } from "../sections/branches";
import { CloudHistorySection } from "../sections/HistorySection";
import { CloudAccessSection } from "../sections/access/AccessSection";
import { CloudRepositoryOverview } from "../sections/overview";
import { CloudProjectSettingsSection } from "../sections/settings";
import { CloudProjectWebSection } from "../states/CloudProjectWebSection";
import { repositoryTargetKey } from "../repositoryTarget";
import { getCloudScopeRows, scopeMatchesMcpEndpoint } from "../utils";

export function CloudProjectRouteOutlet({
  activeSection,
  workspace,
  status,
  cloudSession,
  cloudApiBaseUrl,
  cloudData,
  projectId,
  project,
  loading,
  onSessionChange,
  onSelectSection,
  onOpenProject,
  onRefresh,
  onRemoveCloudRemote,
}: {
  activeSection: CloudWorkspaceSection;
  workspace: Workspace;
  status: GitStatusSnapshot | null;
  cloudSession: DesktopCloudSession;
  cloudApiBaseUrl: string | null;
  cloudData: DesktopCloudDataState;
  projectId: string;
  project: DesktopCloudProject;
  loading: boolean;
  onSessionChange: (session: DesktopCloudSession | null) => void;
  onSelectSection: (section: CloudWorkspaceSection) => void;
  onOpenProject: (projectId: string, section?: CloudWorkspaceSection) => void;
  onRefresh: () => Promise<void>;
  onRemoveCloudRemote?: () => void;
}) {
  const { t } = useLocalization();

  if (activeSection === "contents") {
    return (
      <CloudRepositoryOverview
        workspace={workspace}
        project={project}
        dashboard={cloudData.dashboard}
        tree={cloudData.tree}
        history={cloudData.history}
        scopes={cloudData.scopes}
        connectors={cloudData.connectors}
        mcpEndpoints={cloudData.mcpEndpoints}
        identity={cloudData.identity}
        loading={loading || cloudData.loading}
        onSelectSection={onSelectSection}
        onRefresh={onRefresh}
      />
    );
  }

  if (activeSection === "history") {
    return (
      <CloudHistorySection
        projectId={projectId}
        projectName={project.name ?? workspace.name}
        cloudSession={cloudSession}
        apiBaseUrl={cloudApiBaseUrl}
        onSessionChange={onSessionChange}
      />
    );
  }

  if (activeSection === "branches") {
    return (
      <CloudBranchesSection
        projectId={projectId}
        workspace={workspace}
        cloudSession={cloudSession}
        apiBaseUrl={cloudApiBaseUrl}
        status={status}
        loading={loading}
        onCloudSessionChange={onSessionChange}
        onOpenProject={onOpenProject}
      />
    );
  }

  if (activeSection === "automation") {
    return (
      <CloudAutomationRouteSection
        projectId={projectId}
        cloudSession={cloudSession}
        apiBaseUrl={cloudApiBaseUrl}
        cloudData={cloudData}
        onSessionChange={onSessionChange}
      />
    );
  }

  if (
    activeSection === "mcp"
    || activeSection === "cli"
    || activeSection === "git-sync"
    || activeSection === "access"
  ) {
    const repositoryViews = getCloudScopeRows(cloudData.scopes, cloudData.identity);
    const connectorsByTarget = new Map<string, typeof cloudData.connectors>();
    for (const connector of cloudData.connectors) {
      const key = repositoryTargetKey(connector.target);
      const group = connectorsByTarget.get(key) ?? [];
      group.push(connector);
      connectorsByTarget.set(key, group);
    }
    const mcpEndpointsByTarget = new Map<string, typeof cloudData.mcpEndpoints>();
    for (const view of repositoryViews) {
      mcpEndpointsByTarget.set(
        repositoryTargetKey(view.target),
        cloudData.mcpEndpoints.filter((endpoint) => scopeMatchesMcpEndpoint(view, endpoint)),
      );
    }
    const focusedFilter = activeSection === "mcp"
      ? "mcp"
      : activeSection === "cli"
        ? "cli"
        : activeSection === "git-sync"
          ? "git"
          : "all";
    const focusedTitle = activeSection === "mcp"
      ? t("cloud.route.mcp.title")
      : activeSection === "cli"
        ? t("cloud.route.cli.title")
        : activeSection === "git-sync"
          ? t("cloud.route.git-sync.title")
          : undefined;
    const focusedDescription = activeSection === "mcp"
      ? t("cloud.route.mcp.description")
      : activeSection === "cli"
        ? t("cloud.route.cli.description")
        : activeSection === "git-sync"
          ? t("cloud.route.git-sync.description")
          : undefined;
    const focused = activeSection !== "access";

    return (
      <CloudAccessSection
        projectId={projectId}
        cloudSession={cloudSession}
        apiBaseUrl={cloudApiBaseUrl}
        identity={cloudData.identity}
        scopes={cloudData.scopes}
        connectors={cloudData.connectors}
        connectorsByTarget={connectorsByTarget}
        mcpEndpoints={cloudData.mcpEndpoints}
        mcpEndpointsByTarget={mcpEndpointsByTarget}
        filter={focusedFilter}
        activeAccessRowId={null}
        loading={cloudData.loading}
        onCloudSessionChange={onSessionChange}
        onRefresh={onRefresh}
        onOpenProject={onOpenProject}
        canManage={project.capabilities?.includes("access_surface.manage") === true}
        catalogTitle={focusedTitle}
        catalogDescription={focusedDescription}
        catalogFilterLocked={focused}
        catalogHeaderAction={focused ? (
          <button
            className="desktop-cloud-access-new-button"
            type="button"
            onClick={() => onOpenProject(projectId, "access")}
          >
            {t("cloud.access.open")}
          </button>
        ) : undefined}
      />
    );
  }

  if (activeSection === "team") {
    return (
      <CloudProjectWebSection
        projectId={projectId}
        icon={Users}
        title={t("cloud.route.team.title")}
        description={t("cloud.project.teamDescription")}
        primaryLabel={t("cloud.project.openTeamSettings")}
        onOpen={() => onOpenProject(projectId, "team")}
      />
    );
  }

  if (activeSection === "settings") {
    return (
      <CloudProjectSettingsSection
        project={project}
        cloudSession={cloudSession}
        apiBaseUrl={cloudApiBaseUrl}
        loading={loading || cloudData.loading}
        matchesRepositoryRemote
        removeRemoteAction={onRemoveCloudRemote ? { onRemove: onRemoveCloudRemote } : null}
        onSessionChange={onSessionChange}
        onRefresh={onRefresh}
        onSelectSection={onSelectSection}
      />
    );
  }

  return (
    <CloudWorkspaceLoadingState
      label={t(activeSection === "initialize"
        ? "cloud.initialize.loadingRepository"
        : "cloud.state.sectionNeedsProject")}
    />
  );
}
