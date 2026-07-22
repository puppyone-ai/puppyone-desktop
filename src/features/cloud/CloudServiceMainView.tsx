import { useEffect, useRef, useState } from "react";
import { useLocalization } from "@puppyone/localization/react";
import {
  openCloudApp,
} from "../../lib/cloudApi";
import type { CloudServiceMainViewProps, CloudWorkspaceSection } from "./types";
import { getResolvedCloudProjectId } from "./context";
import { getCloudAuthEmail, getCloudAuthSession } from "./auth";
import { useDesktopCloudData } from "./data";
import type { CloudProjectDetailResource } from "./data/cloudProjectDetails";
import { useCloudProjectCatalog } from "./data/useCloudProjectCatalog";
import { CloudWorkspaceLoadingState } from "./components/shared";
import { CloudProjectBrowser, CloudProjectBrowserSignedOut } from "./components/ProjectBrowser";
import { useCloudOrganizationData } from "./components/CloudGlobalPages";
import { CloudLocalGitStatusError, CloudLocalOnlyWorkspace } from "./states";
import { CloudRouter } from "./routes/CloudRouter";
import type { CloudActionState } from "./routes/CloudRouter";
import { getCloudRouteWebPath, isCloudAccountSection, normalizeCloudSection } from "./routes/cloudRoutes";
import { cloudMessage, formatCloudMessage, formatCloudPublishFailure } from "./cloudPresentation";
import { getCloudPublishReadiness } from "./workspace/cloudPublishReadiness";

export function CloudServiceMainView({
  workspace,
  status,
  cloudEnvironment,
  cloudAuthState,
  projectContext = null,
  onCloudSessionChange,
  activeSection,
  loading,
  error,
  cloudBackupLoading,
  cloudBackupPending,
  cloudPublishError,
  cloudPublishNotice,
  cloudPublishProgress,
  cloudPublishState,
  cloudPublishStateLoading,
  onAbandonPuppyoneBackup,
  onStartPuppyoneBackup,
  onRemoveCloudRemote,
  onSelectSection,
  onRefresh,
  onOpenGitSettings,
  onOpenSourceControl,
}: CloudServiceMainViewProps) {
  const { t } = useLocalization();
  const cloudRemote = cloudEnvironment.cloudRemote;
  const cloudApiBaseUrl = cloudEnvironment.apiBaseUrl;
  const routedSection = normalizeCloudSection(activeSection);
  const inCloudGlobalSection = isCloudAccountSection(routedSection)
    || routedSection === "templates"
    || routedSection === "projects";
  const localOnlyContext = activeSection === "initialize"
    && (
      projectContext?.status === "local-only"
      || cloudPublishState !== null
      || cloudPublishStateLoading
      || (projectContext?.status === "resolving" && status === null)
    );
  const effectiveCloudSession = getCloudAuthSession(cloudAuthState);
  const projectDetailResources = getCloudProjectDetailResources(routedSection);
  const contextProjectId = projectContext ? getResolvedCloudProjectId(projectContext) : null;
  const cloudData = useDesktopCloudData({
    session: effectiveCloudSession,
    cloudEnvironment,
    explicitProjectId: null,
    repositoryProjectId: inCloudGlobalSection ? null : contextProjectId,
    onSessionChange: onCloudSessionChange,
    workspaceRevisionKey: status?.headCommitId ?? null,
    loadProjectDetails: projectDetailResources.length > 0,
    projectDetailResources,
  });
  const projectCatalog = useCloudProjectCatalog({
    enabled: routedSection === "projects",
    session: effectiveCloudSession,
    apiBaseUrl: cloudApiBaseUrl,
    onSessionChange: onCloudSessionChange,
  });
  const [cloudAction, setCloudAction] = useState<CloudActionState>({
    kind: null,
    projectId: null,
    notice: null,
    error: null,
  });

  const accountEmail = getCloudAuthEmail(cloudAuthState);
  const actionContextKey = `${workspace.path}\n${accountEmail ?? ""}\n${cloudApiBaseUrl ?? ""}`;
  const actionContextRef = useRef(actionContextKey);
  const actionRequestRef = useRef<symbol | null>(null);
  actionContextRef.current = actionContextKey;
  useEffect(() => {
    actionRequestRef.current = null;
    setCloudAction({ kind: null, projectId: null, notice: null, error: null });
  }, [workspace.path, accountEmail, cloudApiBaseUrl]);

  useEffect(() => {
    const normalizedSection = normalizeCloudSection(activeSection);
    if (normalizedSection !== activeSection) {
      onSelectSection(normalizedSection);
    }
  }, [activeSection, onSelectSection]);

  const currentBranchName = status?.branch ?? null;
  const localChangeCount = status?.entries.length ?? 0;
  const branchName = currentBranchName ?? t("cloud.git.noBranch");
  const cloudPublishErrorMessage = cloudPublishError
    ? formatCloudPublishFailure(cloudPublishError, t)
    : null;

  useEffect(() => {
    if (
      routedSection === "initialize"
      && projectContext?.status === "resolved"
      && !cloudPublishStateLoading
      && !cloudPublishState
      && !cloudBackupLoading
    ) {
      onSelectSection("contents");
    }
  }, [
    cloudBackupLoading,
    cloudPublishState,
    cloudPublishStateLoading,
    onSelectSection,
    projectContext?.status,
    routedSection,
  ]);

  if (cloudAuthState.status === "restoring" && !effectiveCloudSession) {
    return (
      <main className="desktop-cloud-main-view">
        <div className="desktop-cloud-page-shell">
          <CloudWorkspaceLoadingState label={t("cloud.loading.session")} />
        </div>
      </main>
    );
  }

  if (!effectiveCloudSession) {
    if (cloudAuthState.status === "signing-out") {
      return (
        <main className="desktop-cloud-main-view">
          <div className="desktop-cloud-page-shell">
            <CloudWorkspaceLoadingState label={t("cloud.loading.session")} />
          </div>
        </main>
      );
    }

    return (
      <main className="desktop-cloud-main-view desktop-cloud-auth-main-view">
        <div className="desktop-cloud-page-shell">
          <CloudProjectBrowserSignedOut
            apiBaseUrl={cloudApiBaseUrl}
            accountEmail={null}
            onSignedIn={(session) => onCloudSessionChange(session)}
            onSignedOut={() => onCloudSessionChange(null)}
            onRefresh={onRefresh}
          />
        </div>
      </main>
    );
  }

  if (localOnlyContext) {
    if (error) {
      return (
        <main className="desktop-cloud-main-view desktop-cloud-initialize-main-view">
          <div className="desktop-cloud-page-shell">
            <CloudLocalGitStatusError error={error} loading={loading} onRetry={onRefresh} />
          </div>
        </main>
      );
    }

    if (!status) {
      return (
        <main className="desktop-cloud-main-view desktop-cloud-initialize-main-view">
          <div className="desktop-cloud-page-shell">
            <CloudWorkspaceLoadingState label={t("cloud.initialize.loadingRepository")} />
          </div>
        </main>
      );
    }

    return (
      <main className="desktop-cloud-main-view desktop-cloud-initialize-main-view">
        <div className="desktop-cloud-page-shell">
          {cloudAction.notice && (
            <div className="desktop-cloud-main-alert success" role="status">
              {formatCloudMessage(cloudAction.notice, t)}
            </div>
          )}
          {cloudPublishNotice === "cleanup-completed" && (
            <div className="desktop-cloud-main-alert success" role="status">
              {t("cloud.initialize.cleanupCompleted")}
            </div>
          )}
          {cloudPublishState || cloudPublishStateLoading ? (
            <CloudLocalOnlyWorkspace
              workspace={workspace}
              accountEmail={accountEmail}
              branchName={branchName}
              totalCommits={status.totalCommits ?? 0}
              localChangeCount={localChangeCount}
              localChangeCountIsMinimum={status.didHitStatusLimit}
              publishReadiness={getCloudPublishReadiness(status)}
              isGitRepository={status.isRepo === true}
              hasHeadCommit={Boolean(status.headCommitId)}
              hasCurrentBranch={getCloudPublishReadiness(status) !== "branch-required"}
              publishLoading={cloudBackupLoading}
              publishPending={cloudBackupPending}
              publishError={cloudPublishError}
              publishProgress={cloudPublishProgress}
              publishState={cloudPublishState}
              publishStateLoading={cloudPublishStateLoading}
              onAbandonPublish={onAbandonPuppyoneBackup}
              onOpenSourceControl={onOpenSourceControl ?? onOpenGitSettings}
              onRefresh={onRefresh}
              onPublishWorkspace={onStartPuppyoneBackup}
            />
          ) : (
            <AuthenticatedCloudInitialize
              workspace={workspace}
              status={status}
              session={effectiveCloudSession}
              apiBaseUrl={cloudApiBaseUrl}
              accountEmail={accountEmail}
              branchName={branchName}
              localChangeCount={localChangeCount}
              publishLoading={cloudBackupLoading}
              publishPending={cloudBackupPending}
              publishError={cloudPublishError}
              publishProgress={cloudPublishProgress}
              onSessionChange={onCloudSessionChange}
              onOpenSourceControl={onOpenSourceControl ?? onOpenGitSettings}
              onRefresh={onRefresh}
              onPublishWorkspace={onStartPuppyoneBackup}
              onAbandonPublish={onAbandonPuppyoneBackup}
            />
          )}
        </div>
      </main>
    );
  }

  const handleOpenProject = (projectId: string, section: CloudWorkspaceSection = "access") => {
    openCloudApp(getCloudRouteWebPath(section, projectId));
  };

  const handleRemoveCloudRemote = async () => {
    if (!onRemoveCloudRemote || actionRequestRef.current) return;
    const request = Symbol("remove-cloud-git-remote");
    actionRequestRef.current = request;
    setCloudAction({ kind: "configure-remote", projectId: contextProjectId, notice: null, error: null });
    try {
      await onRemoveCloudRemote();
      setCloudAction({
        kind: null,
        projectId: null,
        notice: cloudMessage("cloud-remote-removed"),
        error: null,
      });
    } catch (actionError) {
      setCloudAction({
        kind: null,
        projectId: contextProjectId,
        notice: null,
        error: cloudMessage("remove-remote-failed", undefined, actionError instanceof Error ? actionError.message : undefined),
      });
    } finally {
      if (actionRequestRef.current === request) actionRequestRef.current = null;
    }
  };

  const accountConnected = Boolean(accountEmail);
  return (
    <main className={`desktop-cloud-main-view ${activeSection === "automation" ? "desktop-cloud-automation-main-view" : ""}`}>
      <div className={`desktop-cloud-page-shell ${activeSection === "automation" ? "desktop-cloud-automation-page-shell" : ""}`}>
        {cloudAuthState.status === "offline-authenticated" && (
          <div className="desktop-cloud-main-alert">
            {t("cloud.offline")}
          </div>
        )}
        {projectContext?.status === "resolved" && projectContext.warning && (
          <div className="desktop-cloud-main-alert warning" role="status">
            <span>{formatCloudMessage(projectContext.warning, t)}</span>
          </div>
        )}
        {!inCloudGlobalSection && error && <div className="desktop-cloud-main-alert">{error}</div>}
        {!inCloudGlobalSection && cloudData.error && <div className="desktop-cloud-main-alert">{formatCloudMessage(cloudData.error, t)}</div>}
        {routedSection === "projects" && projectCatalog.error && (
          <div className="desktop-cloud-main-alert">{formatCloudMessage(projectCatalog.error, t)}</div>
        )}
        {!inCloudGlobalSection && cloudData.warning && <div className="desktop-cloud-main-alert">{formatCloudMessage(cloudData.warning, t)}</div>}
        {!inCloudGlobalSection && cloudPublishErrorMessage && <div className="desktop-cloud-main-alert">{cloudPublishErrorMessage}</div>}
        {!inCloudGlobalSection && cloudAction.error && <div className="desktop-cloud-main-alert">{formatCloudMessage(cloudAction.error, t)}</div>}
        {!inCloudGlobalSection && cloudAction.notice && <div className="desktop-cloud-main-alert success">{formatCloudMessage(cloudAction.notice, t)}</div>}

        {routedSection === "projects" ? (
          <CloudProjectBrowser
            projects={projectCatalog.projects}
            loading={projectCatalog.loading}
            session={effectiveCloudSession}
            apiBaseUrl={cloudApiBaseUrl}
            currentRepositoryProjectId={null}
            backupLoading={false}
            cloudAction={{ kind: null, projectId: null }}
            onSessionChange={onCloudSessionChange}
            onBackupWorkspace={() => undefined}
            onSelectProject={(project) => handleOpenProject(project.id, "contents")}
            onConfigureProjectRemote={() => undefined}
            onOpenCloudProjects={() => openCloudApp(getCloudRouteWebPath("projects"))}
            showRepositoryActions={false}
          />
        ) : (
          <CloudRouter
            workspace={workspace}
            status={status}
            cloudSession={effectiveCloudSession}
            cloudApiBaseUrl={cloudApiBaseUrl}
            cloudRemote={cloudRemote}
            cloudData={cloudData}
            projectContext={projectContext}
            activeSection={routedSection}
            accountEmail={accountEmail}
            accountConnected={accountConnected}
            loading={loading}
            onSessionChange={onCloudSessionChange}
            onOpenProject={handleOpenProject}
            onOpenGitSettings={onOpenGitSettings}
            onSelectSection={onSelectSection}
            onRetryContext={() => {
              void cloudData.reload();
              onRefresh();
            }}
            onUseAnotherAccount={() => onCloudSessionChange(null)}
            onRemoveCloudRemote={onRemoveCloudRemote ? () => void handleRemoveCloudRemote() : undefined}
          />
        )}
      </div>
    </main>
  );
}

function AuthenticatedCloudInitialize({
  workspace,
  status,
  session,
  apiBaseUrl,
  accountEmail,
  branchName,
  localChangeCount,
  publishLoading,
  publishPending,
  publishError,
  publishProgress,
  onSessionChange,
  onOpenSourceControl,
  onRefresh,
  onPublishWorkspace,
  onAbandonPublish,
}: {
  workspace: CloudServiceMainViewProps["workspace"];
  status: NonNullable<CloudServiceMainViewProps["status"]>;
  session: NonNullable<ReturnType<typeof getCloudAuthSession>>;
  apiBaseUrl: string | null;
  accountEmail: string | null;
  branchName: string;
  localChangeCount: number;
  publishLoading: boolean;
  publishPending: boolean;
  publishError: CloudServiceMainViewProps["cloudPublishError"];
  publishProgress: CloudServiceMainViewProps["cloudPublishProgress"];
  onSessionChange: CloudServiceMainViewProps["onCloudSessionChange"];
  onOpenSourceControl: () => void;
  onRefresh: () => void;
  onPublishWorkspace: CloudServiceMainViewProps["onStartPuppyoneBackup"];
  onAbandonPublish: () => void;
}) {
  const { t } = useLocalization();
  const autoStartedOrganizationRef = useRef<string | null>(null);
  const organizationData = useCloudOrganizationData(
    session,
    apiBaseUrl,
    onSessionChange,
    { loadTeamDetails: false, selectionPolicy: "explicit" },
  );
  const organizationError = organizationData.error
    ? formatCloudMessage(organizationData.error, t)
    : null;
  useEffect(() => {
    const organizationId = organizationData.selectedOrganizationId;
    if (
      !publishPending
      || publishLoading
      || organizationData.status !== "ready"
      || organizationData.organizations.length !== 1
      || !organizationId
      || autoStartedOrganizationRef.current === organizationId
    ) return;
    autoStartedOrganizationRef.current = organizationId;
    onPublishWorkspace(organizationId);
  }, [
    onPublishWorkspace,
    organizationData.organizations.length,
    organizationData.selectedOrganizationId,
    organizationData.status,
    publishLoading,
    publishPending,
  ]);
  return (
    <CloudLocalOnlyWorkspace
      workspace={workspace}
      accountEmail={accountEmail}
      branchName={branchName}
      totalCommits={status.totalCommits ?? 0}
      localChangeCount={localChangeCount}
      localChangeCountIsMinimum={status.didHitStatusLimit}
      publishReadiness={getCloudPublishReadiness(status)}
      isGitRepository={status.isRepo === true}
      hasHeadCommit={Boolean(status.headCommitId)}
      hasCurrentBranch={getCloudPublishReadiness(status) !== "branch-required"}
      publishLoading={publishLoading}
      publishPending={publishPending}
      publishError={publishError}
      publishProgress={publishProgress}
      onAbandonPublish={onAbandonPublish}
      onOpenSourceControl={onOpenSourceControl}
      onRefresh={onRefresh}
      organizations={organizationData.organizations}
      selectedOrganizationId={organizationData.selectedOrganizationId}
      organizationStatus={organizationData.status === "partial" ? "ready" : organizationData.status}
      organizationError={organizationError}
      onSelectOrganization={organizationData.selectOrganization}
      onRetryOrganizations={organizationData.refresh}
      onPublishWorkspace={onPublishWorkspace}
    />
  );
}

function getCloudProjectDetailResources(
  section: CloudWorkspaceSection,
): readonly CloudProjectDetailResource[] {
  if (section === "contents") {
    return ["dashboard", "tree", "history", "scopes", "connectors", "mcp-endpoints", "identity"];
  }
  if (section === "claude") return ["identity", "readiness"];
  if (section === "access" || section === "automation" || section === "mcp-cli") {
    return ["scopes", "connectors", "mcp-endpoints", "identity"];
  }
  if (section === "git-sync") return ["identity"];
  // History and global routes own dedicated loaders.
  return [];
}
