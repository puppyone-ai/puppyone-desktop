import { Settings, Users } from "lucide-react";
import type { MessageFormatter } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import {
  openCloudApp,
  type DesktopCloudProject,
  type DesktopCloudSession,
} from "../../../lib/cloudApi";
import type { GitStatusSnapshot } from "../../../types/electron";
import type { Workspace } from "@puppyone/shared-ui";
import type { getCanonicalPuppyoneRemote } from "../../source-control/remotes";
import type { DesktopCloudDataState } from "../data";
import type { ProjectCloudContext } from "../context";
import {
  getResolvedCloudProjectId,
  isCloudContextRecovery,
} from "../context";
import type { CloudWorkspaceSection } from "../types";
import { CloudGlobalBillingPage } from "../components/CloudBillingPage";
import { CloudGlobalTeamPage } from "../components/CloudGlobalPages";
import { CloudTemplateStore } from "../components/CloudTemplateStore";
import { CloudWorkspaceLoadingState } from "../components/shared";
import { CloudAutomationRouteSection } from "../sections/AutomationRouteSection";
import { CloudBranchesSection } from "../sections/BranchesSection";
import { CloudGitSyncSection } from "../sections/GitSyncSection";
import { CloudHistorySection } from "../sections/HistorySection";
import { CloudClaudeSection } from "../sections/ClaudeSection";
import { CloudMcpCliSection } from "../sections/McpCliSection";
import { CloudRepositoryOverview } from "../sections/OverviewSection";
import { CloudAccessSection } from "../sections/access/AccessSection";
import {
  CloudProjectRecoveryState,
  CloudProjectWebSection,
  CloudLocalOnlyWorkspace,
} from "../states";
import { getCloudRouteWebPath } from "./cloudRoutes";
import { formatCloudMessage, type CloudMessageDescriptor } from "../cloudPresentation";
import { useFeatureFlag } from "../../flags";
import { getCloudScopeRows, scopeMatchesMcpEndpoint } from "../utils";
import { repositoryTargetKey, type RepositoryTarget } from "../repositoryTarget";

export type CloudActionState = {
  kind: "backup" | "configure-remote" | "copy" | null;
  projectId: string | null;
  notice: CloudMessageDescriptor | null;
  error: CloudMessageDescriptor | null;
};

export function CloudRouter({
  workspace,
  status,
  cloudSession,
  cloudApiBaseUrl,
  cloudRemote,
  cloudData,
  projectContext = null,
  activeSection,
  accountEmail,
  accountConnected,
  branchName,
  localChangeCount,
  loading,
  cloudBackupLoading,
  onSessionChange,
  onBackupWorkspace,
  onOpenProject,
  onOpenGitSettings,
  onSelectSection,
  onRetryContext,
  onUseAnotherAccount,
  onRemoveCloudRemote,
}: {
  workspace: Workspace;
  status: GitStatusSnapshot | null;
  cloudSession: DesktopCloudSession;
  cloudApiBaseUrl: string | null;
  cloudRemote: ReturnType<typeof getCanonicalPuppyoneRemote>;
  cloudData: DesktopCloudDataState;
  projectContext?: ProjectCloudContext | null;
  activeSection: CloudWorkspaceSection;
  accountEmail: string | null;
  accountConnected: boolean;
  branchName: string;
  localChangeCount: number;
  loading: boolean;
  cloudBackupLoading: boolean;
  onSessionChange: (session: DesktopCloudSession | null) => void;
  onBackupWorkspace: () => void;
  onOpenProject: (projectId: string, section?: CloudWorkspaceSection) => void;
  onOpenGitSettings: () => void;
  onSelectSection: (section: CloudWorkspaceSection) => void;
  onRetryContext?: () => void;
  onUseAnotherAccount?: () => void;
  onRemoveCloudRemote?: () => void;
}) {
  const { t } = useLocalization();
  const billingEnabled = useFeatureFlag("cloudBilling");
  const contextProjectId = getResolvedCloudProjectId(projectContext ?? { status: "local-only", projectId: null })
    ?? cloudData.contextProjectId;
  const contextProject = cloudData.contextProject;
  const activeProject = cloudData.activeProject;

  // 1) Account routes first
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
    if (!billingEnabled) {
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
    return (
      <CloudGlobalBillingPage
        session={cloudSession}
        apiBaseUrl={cloudApiBaseUrl}
        onSessionChange={onSessionChange}
      />
    );
  }

  if (activeSection === "templates") {
    return (
      <CloudTemplateStore
        session={cloudSession}
        apiBaseUrl={cloudApiBaseUrl}
        onSessionChange={onSessionChange}
        onProjectCreated={(project) => {
          // Template instantiation creates a Cloud Project; it must not
          // configure the currently open local repository implicitly.
          onOpenProject(project.id, "contents");
        }}
      />
    );
  }

  // 2) Resolve the local repository's canonical PuppyOne Git locator before
  // entering Project sections.
  if (projectContext?.status === "resolving") {
    return <CloudWorkspaceLoadingState label={t("cloud.loading.matchingProject")} />;
  }

  if (projectContext && isCloudContextRecovery(projectContext)) {
    return (
      <CloudProjectRecoveryState
        title={projectContext.status === "temporarily-unavailable"
          ? t("cloud.message.remote-network-failed")
          : undefined}
        message={formatCloudMessage(projectContext.message, t)}
        remoteLabel={cloudRemote?.info.displayId ?? null}
        loading={cloudData.loading}
        onRetry={() => {
          if (onRetryContext) onRetryContext();
          else void cloudData.reload();
        }}
        onUseAnotherAccount={() => {
          if (onUseAnotherAccount) onUseAnotherAccount();
          else onSessionChange(null);
        }}
        showUseAnotherAccount={projectContext.status !== "temporarily-unavailable"}
        onOpenGitDetails={onOpenGitSettings}
      />
    );
  }

  // Authorized local context: always enter the exact Project — never a catalog.
  if (contextProjectId) {
    return renderProjectContextSection({
      activeSection,
      workspace,
      status,
      cloudSession,
      cloudApiBaseUrl,
      cloudRemote,
      cloudData,
      projectId: contextProjectId,
      project: contextProject ?? activeProject ?? { id: contextProjectId, name: workspace.name },
      loading,
      accountConnected,
      onSessionChange,
      onSelectSection,
      onOpenProject,
      onOpenGitSettings,
      onRefresh: cloudData.reload,
      repositoryTarget: projectContext?.status === "resolved" ? projectContext.target : null,
      scopePath: projectContext?.status === "resolved" ? projectContext.scopePath ?? null : null,
      readiness: projectContext?.status === "resolved"
        ? projectContext.readiness ?? cloudData.readiness
        : cloudData.readiness,
      onRemoveCloudRemote: projectContext?.status === "resolved" ? onRemoveCloudRemote : undefined,
      t,
    });
  }

  if (!projectContext || projectContext.status === "local-only") {
    return (
      <CloudLocalOnlyWorkspace
        workspace={workspace}
        accountEmail={accountEmail}
        branchName={branchName}
        localChangeCount={localChangeCount}
        publishLoading={cloudBackupLoading}
        cloudRemote={cloudRemote}
        onPublishWorkspace={onBackupWorkspace}
      />
    );
  }

  return <CloudWorkspaceLoadingState label={t("cloud.loading.project")} />;
}

function renderProjectContextSection({
  activeSection,
  workspace,
  status,
  cloudSession,
  cloudApiBaseUrl,
  cloudRemote,
  cloudData,
  projectId,
  project,
  loading,
  accountConnected,
  onSessionChange,
  onSelectSection,
  onOpenProject,
  onOpenGitSettings,
  onRefresh,
  repositoryTarget,
  scopePath,
  readiness,
  onRemoveCloudRemote,
  t,
}: {
  activeSection: CloudWorkspaceSection;
  workspace: Workspace;
  status: GitStatusSnapshot | null;
  cloudSession: DesktopCloudSession;
  cloudApiBaseUrl: string | null;
  cloudRemote: ReturnType<typeof getCanonicalPuppyoneRemote>;
  cloudData: DesktopCloudDataState;
  projectId: string;
  project: DesktopCloudProject;
  loading: boolean;
  accountConnected: boolean;
  onSessionChange: (session: DesktopCloudSession | null) => void;
  onSelectSection: (section: CloudWorkspaceSection) => void;
  onOpenProject: (projectId: string, section?: CloudWorkspaceSection) => void;
  onOpenGitSettings: () => void;
  onRefresh: () => Promise<void>;
  repositoryTarget: RepositoryTarget | null;
  scopePath: string | null;
  readiness: import("../../../lib/cloudApi").DesktopCloudProjectReadiness | null;
  onRemoveCloudRemote?: () => void;
  t: MessageFormatter;
}) {
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

  if (activeSection === "overview" || activeSection === "contents") {
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
        matchesRepositoryRemote
        loading={loading || cloudData.loading}
        onSelectSection={onSelectSection}
        onOpenProject={onOpenProject}
        onRefresh={onRefresh}
        removeRemoteAction={onRemoveCloudRemote
          ? { onRemove: onRemoveCloudRemote }
          : null}
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

  if (activeSection === "claude") {
    return (
      <CloudClaudeSection
        readiness={readiness}
        identity={cloudData.identity}
        repositoryTarget={repositoryTarget}
        scopePath={scopePath}
        loading={cloudData.loading}
        onCreateGit={() => onSelectSection("access")}
        onOpenGitSync={onOpenGitSettings}
        onOpenClaude={() => onOpenProject(projectId, "claude")}
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

  if (activeSection === "access" || activeSection === "mcp-cli" || activeSection === "git-sync") {
    if (activeSection === "mcp-cli") {
      return (
        <CloudMcpCliSection
          projectId={projectId}
          identity={cloudData.identity}
          scopes={repositoryViews}
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
        activeAccessRowId={null}
        loading={cloudData.loading}
        onCloudSessionChange={onSessionChange}
        onRefresh={onRefresh}
        onOpenProject={onOpenProject}
        canManage={project.capabilities?.includes("access_surface.manage") === true}
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

  return (
    <CloudProjectWebSection
      projectId={projectId}
      icon={Settings}
      title={t("cloud.route.settings.title")}
      description={t("cloud.project.settingsDescription")}
      primaryLabel={t("cloud.project.openSettings")}
      onOpen={() => onOpenProject(projectId, "settings")}
    />
  );
}
