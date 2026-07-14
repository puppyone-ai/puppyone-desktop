import { Settings, Users } from "lucide-react";
import type { MessageFormatter } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import { openCloudApp, type DesktopCloudProject, type DesktopCloudSession } from "../../../lib/cloudApi";
import type { GitStatusSnapshot } from "../../../types/electron";
import type { Workspace } from "@puppyone/shared-ui";
import type { getPuppyoneRemote } from "../../source-control/remotes";
import type { DesktopCloudDataState } from "../data";
import type { ProjectCloudAttachment } from "../attachment";
import {
  getResolvedCloudProjectId,
  isCloudAttachmentRecovery,
} from "../attachment";
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
import { CloudMappedOverview } from "../sections/OverviewSection";
import { CloudAccessSection } from "../sections/access/AccessSection";
import {
  CloudProjectRecoveryState,
  CloudProjectWebSection,
  CloudUnmappedWorkspace,
} from "../states";
import { getCloudRouteWebPath } from "./cloudRoutes";
import { formatCloudMessage, type CloudMessageDescriptor } from "../cloudPresentation";
import { useFeatureFlag } from "../../flags";

export type CloudActionState = {
  kind: "backup" | "connect" | "copy" | null;
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
  attachment = null,
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
  onRetryBinding,
  onUseAnotherAccount,
  onConfirmLegacyBinding,
  onDetachCloudProject,
}: {
  workspace: Workspace;
  status: GitStatusSnapshot | null;
  cloudSession: DesktopCloudSession;
  cloudApiBaseUrl: string | null;
  cloudRemote: ReturnType<typeof getPuppyoneRemote>;
  cloudData: DesktopCloudDataState;
  attachment?: ProjectCloudAttachment | null;
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
  onRetryBinding?: () => void;
  onUseAnotherAccount?: () => void;
  onConfirmLegacyBinding?: (input: {
    projectId: string;
    scopeId: string | null;
    bindingKind: "full" | "scoped";
  }) => void;
  onDetachCloudProject?: () => void;
}) {
  const { t } = useLocalization();
  const billingEnabled = useFeatureFlag("cloudBilling");
  const mappedProjectId = getResolvedCloudProjectId(attachment ?? { status: "local-only", projectId: null })
    ?? cloudData.mappedProjectId;
  const mappedProject = cloudData.mappedProject;
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
          // Template instantiation creates a Cloud Project; it must not attach
          // that Project to the currently open local workspace implicitly.
          onOpenProject(project.id, "contents");
        }}
      />
    );
  }

  // 2) Workspace binding before project sections / browser
  if (attachment?.status === "resolving") {
    return <CloudWorkspaceLoadingState label={t("cloud.loading.matchingProject")} />;
  }

  if (attachment && isCloudAttachmentRecovery(attachment)) {
    return (
      <CloudProjectRecoveryState
        title={attachment.status === "temporarily-unavailable"
          ? t("cloud.message.binding-network-failed")
          : undefined}
        message={formatCloudMessage(attachment.message, t)}
        remoteLabel={cloudRemote?.info.displayId ?? null}
        loading={cloudData.loading}
        onRetry={() => {
          if (onRetryBinding) onRetryBinding();
          else void cloudData.reload();
        }}
        onUseAnotherAccount={() => {
          if (onUseAnotherAccount) onUseAnotherAccount();
          else onSessionChange(null);
        }}
        showUseAnotherAccount={attachment.status !== "temporarily-unavailable"}
        onOpenGitDetails={onOpenGitSettings}
        confirmLabel={attachment.status === "legacy-confirmation-required" ? t("cloud.project.confirm") : undefined}
        onConfirm={attachment.status === "legacy-confirmation-required"
          && attachment.projectId
          && attachment.bindingKind
          ? () => onConfirmLegacyBinding?.({
              projectId: attachment.projectId as string,
              scopeId: attachment.scopeId,
              bindingKind: attachment.bindingKind as "full" | "scoped",
            })
          : undefined}
      />
    );
  }

  // Authorized local context: always enter the exact Project — never a catalog.
  if (mappedProjectId) {
    const durableBinding = attachment?.status === "resolved"
      && attachment.bindingStatus === "bound";
    return renderProjectContextSection({
      activeSection,
      workspace,
      status,
      cloudSession,
      cloudApiBaseUrl,
      cloudRemote,
      cloudData,
      projectId: mappedProjectId,
      project: mappedProject ?? activeProject ?? { id: mappedProjectId, name: workspace.name },
      loading,
      accountConnected,
      onSessionChange,
      onSelectSection,
      onOpenProject,
      onOpenGitSettings,
      onRefresh: cloudData.reload,
      bindingKind: attachment?.status === "resolved" ? attachment.bindingKind ?? null : null,
      scopePath: attachment?.status === "resolved" ? attachment.scopePath ?? null : null,
      readiness: attachment?.status === "resolved"
        ? attachment.readiness ?? cloudData.readiness
        : cloudData.readiness,
      onDetachCloudProject: durableBinding ? onDetachCloudProject : undefined,
      t,
    });
  }

  if (!attachment || attachment.status === "local-only") {
    return (
      <CloudUnmappedWorkspace
        workspace={workspace}
        activeSection={activeSection}
        accountEmail={accountEmail}
        branchName={branchName}
        localChangeCount={localChangeCount}
        backupLoading={cloudBackupLoading}
        cloudRemote={cloudRemote}
        onBackupWorkspace={onBackupWorkspace}
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
  bindingKind,
  scopePath,
  readiness,
  onDetachCloudProject,
  t,
}: {
  activeSection: CloudWorkspaceSection;
  workspace: Workspace;
  status: GitStatusSnapshot | null;
  cloudSession: DesktopCloudSession;
  cloudApiBaseUrl: string | null;
  cloudRemote: ReturnType<typeof getPuppyoneRemote>;
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
  bindingKind: "full" | "scoped" | null;
  scopePath: string | null;
  readiness: import("../../../lib/cloudApi").DesktopCloudProjectReadiness | null;
  onDetachCloudProject?: () => void;
  t: MessageFormatter;
}) {
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

  if (activeSection === "overview" || activeSection === "contents") {
    return (
      <CloudMappedOverview
        workspace={workspace}
        project={project}
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
        onRefresh={onRefresh}
        detachAction={onDetachCloudProject
          ? { onDetach: onDetachCloudProject }
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
        bindingKind={bindingKind}
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
