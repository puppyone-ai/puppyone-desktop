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
  getAttachedCloudProjectId,
  isCloudAttachmentRecovery,
} from "../attachment";
import type { CloudWorkspaceSection } from "../types";
import { CloudGlobalBillingPage } from "../components/CloudBillingPage";
import { CloudGlobalTeamPage } from "../components/CloudGlobalPages";
import { CloudProjectBrowser } from "../components/ProjectBrowser";
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
import { deriveCloudWorkspaceBinding } from "../workspace";
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
  const mappedProjectId = getAttachedCloudProjectId(attachment ?? { status: "local-only", projectId: null })
    ?? cloudData.mappedProjectId;
  const mappedProject = cloudData.mappedProject;
  const activeProject = cloudData.activeProject;
  const workspaceBinding = deriveCloudWorkspaceBinding({
    cloudRemote,
    projectId: mappedProjectId,
    loading: cloudData.loading || attachment?.status === "resolving",
    error: attachment && isCloudAttachmentRecovery(attachment)
      ? attachment.message
      : cloudData.error,
  });
  const browsingProjectId = selectedProjectId?.trim()
    && selectedProjectId !== mappedProjectId
    && (!attachment || attachment.status === "local-only")
    ? selectedProjectId.trim()
    : null;
  const browsingCloudProject = Boolean(browsingProjectId);
  const hasPuppyoneRemote = Boolean(cloudRemote);

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
        accountEmail={accountEmail}
        session={cloudSession}
        apiBaseUrl={cloudApiBaseUrl}
        projects={cloudData.projects}
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
          // Selecting the returned Project changes the Cloud data context and
          // triggers its canonical reload. Avoid a redundant pre-navigation
          // reload whose failure could incorrectly look like clone failure.
          onSelectProject(project);
        }}
      />
    );
  }

  // 2) Workspace binding before project sections / browser
  if (attachment?.status === "resolving" || (hasPuppyoneRemote && cloudData.initializing && !mappedProjectId)) {
    return <CloudWorkspaceLoadingState label={t("cloud.loading.matchingProject")} />;
  }

  if (attachment && isCloudAttachmentRecovery(attachment) && hasPuppyoneRemote && !browsingCloudProject) {
    return (
      <CloudProjectRecoveryState
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

  if (cloudData.initializing && !mappedProjectId && !browsingCloudProject) {
    return <CloudWorkspaceLoadingState label={t("cloud.loading.project")} />;
  }

  // Mapped local workspace: always enter project overview / contents — never ProjectBrowser.
  if (mappedProjectId && !browsingCloudProject) {
    return renderBoundProjectSection({
      activeSection,
      workspace,
      status,
      cloudSession,
      cloudApiBaseUrl,
      cloudRemote,
      cloudData,
      projectId: mappedProjectId,
      project: mappedProject ?? activeProject ?? { id: mappedProjectId, name: workspace.name },
      linkedToWorkspace: true,
      loading,
      accountConnected,
      onSessionChange,
      onSelectSection,
      onOpenProject,
      onOpenGitSettings,
      onRefresh: cloudData.reload,
      bindingKind: attachment?.status === "linked" ? attachment.bindingKind ?? null : null,
      scopePath: attachment?.status === "linked" ? attachment.scopePath ?? null : null,
      readiness: attachment?.status === "linked"
        ? attachment.readiness ?? cloudData.readiness
        : cloudData.readiness,
      onDetachCloudProject,
      t,
    });
  }

  // Explicit Cloud-only / browse path may still use the project browser when local-only.
  if (activeSection === "overview" && !hasPuppyoneRemote && !browsingCloudProject) {
    if (attachment?.status === "local-only") {
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
          cloudRemote={null}
          action={cloudAction}
          onBackupWorkspace={onBackupWorkspace}
          onConnectProject={onConnectProject}
          onCopyCloneCommand={onCopyCloneCommand}
          onOpenProject={onOpenProject}
        />
      );
    }
    return (
      <CloudProjectBrowser
        projects={cloudData.projects}
        loading={cloudData.loading}
        session={cloudSession}
        apiBaseUrl={cloudApiBaseUrl}
        mappedProjectId={mappedProjectId}
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

  if (!browsingCloudProject && workspaceBinding.status === "binding-resolving") {
    return <CloudWorkspaceLoadingState label={t("cloud.loading.matchingProject")} />;
  }

  if (!browsingCloudProject && (workspaceBinding.status === "local-only" || workspaceBinding.status === "error") && !hasPuppyoneRemote) {
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

  if (hasPuppyoneRemote && !mappedProjectId && !browsingCloudProject) {
    return (
      <CloudProjectRecoveryState
        message={workspaceBinding.status === "error"
          ? formatCloudMessage(workspaceBinding.message, t)
          : t("cloud.recovery.remoteProjectUnknown")}
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
        onOpenGitDetails={onOpenGitSettings}
      />
    );
  }

  const projectId = browsingProjectId ?? (
    "projectId" in workspaceBinding ? workspaceBinding.projectId : null
  );
  if (!projectId) {
    return <CloudWorkspaceLoadingState label={t("cloud.loading.project")} />;
  }

  const routedProject = (
    activeProject?.id === projectId
      ? activeProject
      : cloudData.projects.find((project) => project.id === projectId)
        ?? (mappedProject?.id === projectId ? mappedProject : null)
        ?? {
          id: projectId,
          name: browsingCloudProject ? t("cloud.project.generic") : workspace.name,
        }
  );

  return renderBoundProjectSection({
    activeSection,
    workspace,
    status,
    cloudSession,
    cloudApiBaseUrl,
    cloudRemote,
    cloudData,
    projectId,
    project: routedProject,
    linkedToWorkspace: !browsingCloudProject,
    loading,
    accountConnected,
    onSessionChange,
    onSelectSection,
    onOpenProject,
    onOpenGitSettings,
    onRefresh: cloudData.reload,
    bindingKind: null,
    scopePath: null,
    readiness: cloudData.readiness,
    onDetachCloudProject: undefined,
    attachAction: browsingCloudProject
      ? {
          busy: cloudAction.kind === "connect" && cloudAction.projectId === projectId,
          onAttach: () => {
            const project = cloudData.projects.find((entry) => entry.id === projectId) ?? routedProject;
            onConnectProject(project);
          },
        }
      : null,
    t,
  });
}

function renderBoundProjectSection({
  activeSection,
  workspace,
  status,
  cloudSession,
  cloudApiBaseUrl,
  cloudRemote,
  cloudData,
  projectId,
  project,
  linkedToWorkspace,
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
  attachAction = null,
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
  linkedToWorkspace: boolean;
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
  attachAction?: { busy: boolean; onAttach: () => void } | null;
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
        linkedToWorkspace={linkedToWorkspace}
        loading={loading || cloudData.loading}
        attachAction={attachAction}
        onSelectSection={onSelectSection}
        onOpenProject={onOpenProject}
        onRefresh={onRefresh}
        detachAction={linkedToWorkspace && onDetachCloudProject
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
