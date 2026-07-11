import { Settings, Users } from "lucide-react";
import { openCloudApp, type DesktopCloudProject, type DesktopCloudSession } from "../../../lib/cloudApi";
import type { GitStatusSnapshot } from "../../../types/electron";
import type { Workspace } from "@puppyone/shared-ui";
import type { getPuppyoneRemote } from "../../source-control/remotes";
import type { DesktopCloudDataState } from "../data";
import type { CloudWorkspaceSection } from "../types";
import { CloudGlobalBillingPage, CloudGlobalTeamPage } from "../components/CloudGlobalPages";
import { CloudProjectBrowser } from "../components/ProjectBrowser";
import { CloudWorkspaceLoadingState } from "../components/shared";
import { CloudAutomationRouteSection } from "../sections/AutomationRouteSection";
import { CloudBranchesSection } from "../sections/BranchesSection";
import { CloudGitSyncSection } from "../sections/GitSyncSection";
import { CloudHistorySection } from "../sections/HistorySection";
import { CloudMcpCliSection } from "../sections/McpCliSection";
import { CloudMappedOverview } from "../sections/OverviewSection";
import { CloudAccessSection } from "../sections/access/AccessSection";
import {
  CloudProjectWebSection,
  CloudRemoteConnectedWorkspace,
  CloudUnmappedWorkspace,
} from "../states";
import { deriveCloudWorkspaceBinding } from "../workspace";
import { getCloudRouteWebPath } from "./cloudRoutes";

export type CloudActionState = {
  kind: "backup" | "connect" | "copy" | null;
  projectId: string | null;
  message: string | null;
  error: string | null;
};

export function CloudRouter({
  workspace,
  status,
  cloudSession,
  cloudApiBaseUrl,
  cloudRemote,
  cloudData,
  selectedProjectId,
  activeSection,
  accountEmail,
  accountConnected,
  branchName,
  localChangeCount,
  loading,
  cloudBackupLoading,
  cloudAction,
  onSessionChange,
  onBackupWorkspace,
  onConnectProject,
  onCopyCloneCommand,
  onOpenProject,
  onOpenGitSettings,
  onSelectProject,
  onSelectSection,
}: {
  workspace: Workspace;
  status: GitStatusSnapshot | null;
  cloudSession: DesktopCloudSession;
  cloudApiBaseUrl: string | null;
  cloudRemote: ReturnType<typeof getPuppyoneRemote>;
  cloudData: DesktopCloudDataState;
  /** Explicit browse context. Never infer this from loaded project data. */
  selectedProjectId: string | null;
  activeSection: CloudWorkspaceSection;
  accountEmail: string | null;
  accountConnected: boolean;
  branchName: string;
  localChangeCount: number;
  loading: boolean;
  cloudBackupLoading: boolean;
  cloudAction: CloudActionState;
  onSessionChange: (session: DesktopCloudSession | null) => void;
  onBackupWorkspace: () => void;
  onConnectProject: (project: DesktopCloudProject) => void;
  onCopyCloneCommand: (project: DesktopCloudProject) => void;
  onOpenProject: (projectId: string, section?: CloudWorkspaceSection) => void;
  onOpenGitSettings: () => void;
  onSelectProject: (project: DesktopCloudProject) => void;
  onSelectSection: (section: CloudWorkspaceSection) => void;
}) {
  const mappedProject = cloudData.mappedProject;
  const activeProject = cloudData.activeProject;
  const workspaceBinding = deriveCloudWorkspaceBinding({
    cloudRemote,
    projectId: cloudData.mappedProjectId,
    loading: cloudData.loading,
    error: cloudData.error,
  });
  const browsingProjectId = selectedProjectId?.trim()
    && selectedProjectId !== cloudData.mappedProjectId
    ? selectedProjectId.trim()
    : null;
  const browsingCloudProject = Boolean(browsingProjectId);

  if (activeSection === "cloud-team") {
    return (
      <CloudGlobalTeamPage
        accountEmail={accountEmail}
        session={cloudSession}
        apiBaseUrl={cloudApiBaseUrl}
        projects={cloudData.projects}
        onSessionChange={onSessionChange}
        onOpen={() => openCloudApp(getCloudRouteWebPath("cloud-team"))}
      />
    );
  }

  if (activeSection === "cloud-billing") {
    return (
      <CloudGlobalBillingPage
        accountEmail={accountEmail}
        session={cloudSession}
        apiBaseUrl={cloudApiBaseUrl}
        projects={cloudData.projects}
        onSessionChange={onSessionChange}
        onOpen={() => openCloudApp(getCloudRouteWebPath("cloud-billing"))}
      />
    );
  }

  if (cloudData.initializing) {
    return <CloudWorkspaceLoadingState label="Loading Cloud project" />;
  }

  if (activeSection === "overview" && cloudData.mappedProjectId) {
    return (
      <CloudMappedOverview
        workspace={workspace}
        project={mappedProject ?? { id: cloudData.mappedProjectId, name: workspace.name }}
        dashboard={cloudData.dashboard}
        tree={cloudData.tree}
        history={cloudData.history}
        scopes={cloudData.scopes}
        connectors={cloudData.connectors}
        mcpEndpoints={cloudData.mcpEndpoints}
        identity={cloudData.identity}
        linkedToWorkspace
        loading={loading || cloudData.loading}
        onSelectSection={onSelectSection}
        onOpenProject={onOpenProject}
        onRefresh={cloudData.reload}
      />
    );
  }

  if (activeSection === "overview") {
    return (
      <CloudProjectBrowser
        projects={cloudData.projects}
        loading={cloudData.loading}
        session={cloudSession}
        apiBaseUrl={cloudApiBaseUrl}
        mappedProjectId={cloudData.mappedProjectId}
        backupLoading={cloudBackupLoading}
        cloudAction={cloudAction}
        onSessionChange={onSessionChange}
        onBackupWorkspace={onBackupWorkspace}
        onSelectProject={onSelectProject}
        onConnectProject={onConnectProject}
        onOpenCloudProjects={() => openCloudApp(getCloudRouteWebPath("overview"))}
      />
    );
  }

  if (!browsingCloudProject && workspaceBinding.status === "resolving") {
    return <CloudWorkspaceLoadingState label="Loading Cloud project" />;
  }

  if (!browsingCloudProject && workspaceBinding.status === "remote-only") {
    if (!cloudRemote) {
      return <CloudWorkspaceLoadingState label="Loading Cloud project" />;
    }
    return (
      <CloudRemoteConnectedWorkspace
        workspace={workspace}
        activeSection={activeSection}
        branchName={branchName}
        localChangeCount={localChangeCount}
        cloudRemote={cloudRemote}
        loading={cloudData.loading}
        userEmail={cloudSession.user_email || accountEmail}
        onRefresh={cloudData.reload}
        onOpenGitSettings={onOpenGitSettings}
      />
    );
  }

  if (!browsingCloudProject && (workspaceBinding.status === "unmapped" || workspaceBinding.status === "error")) {
    return (
      <CloudUnmappedWorkspace
        workspace={workspace}
        activeSection={activeSection}
        accountEmail={accountEmail}
        branchName={branchName}
        localChangeCount={localChangeCount}
        projects={cloudData.projects}
        loading={cloudData.loading}
        backupLoading={cloudBackupLoading}
        cloudRemote={cloudRemote}
        action={cloudAction}
        onBackupWorkspace={onBackupWorkspace}
        onConnectProject={onConnectProject}
        onCopyCloneCommand={onCopyCloneCommand}
        onOpenProject={onOpenProject}
      />
    );
  }

  const projectId = browsingProjectId ?? (
    workspaceBinding.status === "mapped" ? workspaceBinding.projectId : null
  );
  if (!projectId) {
    return <CloudWorkspaceLoadingState label="Loading Cloud project" />;
  }
  const routedProject = (
    activeProject?.id === projectId
      ? activeProject
      : cloudData.projects.find((project) => project.id === projectId)
        ?? (mappedProject?.id === projectId ? mappedProject : null)
        ?? {
          id: projectId,
          name: browsingCloudProject ? "Cloud project" : workspace.name,
        }
  );
  const connectorsByScope = new Map<string, typeof cloudData.connectors>();
  for (const connector of cloudData.connectors) {
    const group = connectorsByScope.get(connector.scope_id) ?? [];
    group.push(connector);
    connectorsByScope.set(connector.scope_id, group);
  }
  const mcpEndpointsByScope = new Map<string, typeof cloudData.mcpEndpoints>();
  for (const scope of cloudData.scopes) {
    mcpEndpointsByScope.set(
      scope.id,
      cloudData.mcpEndpoints.filter((endpoint) => (
        endpoint.path === scope.path
        || (!endpoint.path && scope.is_root)
      )),
    );
  }

  if (activeSection === "contents") {
    return (
      <CloudMappedOverview
        workspace={workspace}
        project={routedProject}
        dashboard={cloudData.dashboard}
        tree={cloudData.tree}
        history={cloudData.history}
        scopes={cloudData.scopes}
        connectors={cloudData.connectors}
        mcpEndpoints={cloudData.mcpEndpoints}
        identity={cloudData.identity}
        linkedToWorkspace={!browsingCloudProject}
        loading={loading || cloudData.loading}
        attachAction={browsingCloudProject && routedProject ? {
          busy: cloudAction.kind === "connect" && cloudAction.projectId === routedProject.id,
          disabled: cloudAction.kind !== null || cloudBackupLoading,
          onAttach: () => onConnectProject(routedProject),
        } : null}
        onSelectSection={onSelectSection}
        onOpenProject={onOpenProject}
        onRefresh={cloudData.reload}
      />
    );
  }

  if (activeSection === "history") {
    return (
      <CloudHistorySection
        projectId={projectId}
        projectName={routedProject?.name ?? workspace.name}
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

  if (activeSection === "access") {
    return (
      <CloudAccessSection
        projectId={projectId}
        cloudSession={cloudSession}
        apiBaseUrl={cloudApiBaseUrl}
        identity={cloudData.identity}
        scopes={cloudData.scopes}
        connectors={cloudData.connectors}
        connectorsByScope={connectorsByScope}
        mcpEndpoints={cloudData.mcpEndpoints}
        mcpEndpointsByScope={mcpEndpointsByScope}
        activeAccessRowId={null}
        loading={cloudData.loading}
        onCloudSessionChange={onSessionChange}
        onRefresh={cloudData.reload}
        onOpenProject={onOpenProject}
      />
    );
  }

  if (activeSection === "mcp-cli") {
    return (
      <CloudMcpCliSection
        projectId={projectId}
        identity={cloudData.identity}
        scopes={cloudData.scopes}
        mcpEndpoints={cloudData.mcpEndpoints}
        loading={cloudData.loading}
        onOpenProject={onOpenProject}
      />
    );
  }

  if (activeSection === "git-sync") {
    return (
      <CloudGitSyncSection
        workspace={workspace}
        status={status}
        identity={cloudData.identity}
        cloudRemote={cloudRemote}
        accountConnected={accountConnected}
        onOpenGitSettings={onOpenGitSettings}
        onRefresh={onOpenGitSettings}
      />
    );
  }

  if (activeSection === "team") {
    return (
      <CloudProjectWebSection
        projectId={projectId}
        icon={Users}
        title="Team"
        description="Project members and roles are managed in Puppyone Cloud."
        primaryLabel="Open team settings"
        onOpen={() => onOpenProject(projectId, "team")}
      />
    );
  }

  return (
    <CloudProjectWebSection
      projectId={projectId}
      icon={Settings}
      title="Settings"
      description="Project metadata, branch defaults, and account-level controls are managed in Cloud."
      primaryLabel="Open project settings"
      onOpen={() => onOpenProject(projectId, "settings")}
    />
  );
}
