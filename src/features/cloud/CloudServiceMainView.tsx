import { useEffect, useMemo, useRef, useState } from "react";
import { useLocalization } from "@puppyone/localization/react";
import {
  openCloudApp,
} from "../../lib/cloudApi";
import type { CloudServiceMainViewProps, CloudWorkspaceSection } from "./types";
import { getResolvedCloudProjectId } from "./context";
import { getCloudAuthEmail, getCloudAuthSession, isCloudAuthBlocking, useCloudSessionForEnvironment } from "./auth";
import { useDesktopCloudData } from "./data";
import { resolveCloudEnvironment } from "./environment";
import { CloudWorkspaceLoadingState } from "./components/shared";
import { CloudProjectBrowserSignedOut } from "./components/ProjectBrowser";
import { CloudLocalGitStatusError, CloudLocalOnlyWorkspace } from "./states";
import { CloudRouter } from "./routes/CloudRouter";
import type { CloudActionState } from "./routes/CloudRouter";
import { getCloudRouteWebPath, isCloudAccountSection, normalizeCloudSection } from "./routes/cloudRoutes";
import { cloudMessage, formatCloudMessage } from "./cloudPresentation";
import { getCloudPublishReadiness } from "./workspace/cloudPublishReadiness";

export function CloudServiceMainView({
  workspace,
  status,
  cloudApiBaseUrl: desktopApiBaseUrl,
  cloudSession,
  sessionRestoring = false,
  projectContext = null,
  onCloudSessionChange,
  activeSection,
  loading,
  error,
  cloudBackupLoading,
  cloudBackupPending,
  cloudBackupError,
  cloudBackupCanRetry = false,
  cloudBackupProjectInitialized = false,
  onStartPuppyoneBackup,
  onRemoveCloudRemote,
  onSelectSection,
  onRefresh,
  onOpenDetails,
  onOpenGitSettings,
  onReviewChanges,
}: CloudServiceMainViewProps) {
  const { t } = useLocalization();
  const cloudEnvironment = useMemo(
    () => resolveCloudEnvironment({ status, desktopApiBaseUrl }),
    [desktopApiBaseUrl, status],
  );
  const cloudRemote = cloudEnvironment.cloudRemote;
  const cloudApiBaseUrl = cloudEnvironment.apiBaseUrl;
  const inCloudGlobalSection = isCloudAccountSection(activeSection)
    || activeSection === "templates"
    || activeSection === "overview";
  const localOnlyContext = activeSection === "initialize"
    && (
      projectContext?.status === "local-only"
      || cloudBackupProjectInitialized
      || (projectContext?.status === "resolving" && status === null)
    );
  const cloudAuthState = useCloudSessionForEnvironment({
    cloudSession,
    sessionRestoring,
    restoreEnabled: !localOnlyContext,
    environment: cloudEnvironment,
    onCloudSessionChange,
  });
  const effectiveCloudSession = getCloudAuthSession(cloudAuthState);
  const loadAggregateProjectDetails = shouldLoadAggregateProjectDetails(activeSection);
  const contextProjectId = projectContext ? getResolvedCloudProjectId(projectContext) : null;
  const cloudData = useDesktopCloudData({
    session: effectiveCloudSession,
    cloudEnvironment,
    explicitProjectId: null,
    repositoryProjectId: contextProjectId,
    onSessionChange: onCloudSessionChange,
    workspaceRevisionKey: status?.headCommitId ?? null,
    loadProjectDetails: loadAggregateProjectDetails,
    loadProjectCatalog: activeSection === "overview",
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

  if (localOnlyContext) {
    if (error) {
      return (
        <main className="desktop-cloud-main-view">
          <div className="desktop-cloud-page-shell">
            <CloudLocalGitStatusError error={error} loading={loading} onRetry={onRefresh} />
          </div>
        </main>
      );
    }

    if (!status) {
      return (
        <main className="desktop-cloud-main-view">
          <div className="desktop-cloud-page-shell">
            <CloudWorkspaceLoadingState label={t("cloud.initialize.loadingRepository")} />
          </div>
        </main>
      );
    }

    return (
      <main className="desktop-cloud-main-view">
        <div className="desktop-cloud-page-shell">
          <CloudLocalOnlyWorkspace
            workspace={workspace}
            accountEmail={accountEmail}
            branchName={branchName}
            totalCommits={status?.totalCommits ?? 0}
            localChangeCount={localChangeCount}
            localChangeCountIsMinimum={status.didHitStatusLimit}
            publishReadiness={getCloudPublishReadiness(status)}
            isGitRepository={status?.isRepo === true}
            hasHeadCommit={Boolean(status?.headCommitId)}
            hasCurrentBranch={getCloudPublishReadiness(status) !== "branch-required"}
            publishLoading={cloudBackupLoading}
            publishPending={cloudBackupPending}
            publishError={cloudBackupError}
            publishCanRetry={cloudBackupCanRetry}
            projectInitialized={cloudBackupProjectInitialized}
            onReviewChanges={onReviewChanges}
            onPublishWorkspace={onStartPuppyoneBackup}
          />
        </div>
      </main>
    );
  }

  if (cloudAuthState.status === "restoring" && !effectiveCloudSession) {
    return (
      <main className="desktop-cloud-main-view">
        <div className="desktop-cloud-page-shell">
          <CloudWorkspaceLoadingState label={t("cloud.loading.session")} />
        </div>
      </main>
    );
  }

  const handleOpenProject = (projectId: string, section: CloudWorkspaceSection = "access") => {
    openCloudApp(getCloudRouteWebPath(section, projectId));
  };

  const handleBackupWorkspace = async () => {
    if (actionRequestRef.current || cloudBackupLoading) return;
    if (!effectiveCloudSession) {
      onOpenDetails();
      return;
    }

    setCloudAction({ kind: null, projectId: null, notice: null, error: null });
    onStartPuppyoneBackup();
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
      onSelectSection("overview");
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

  if (isCloudAuthBlocking(cloudAuthState)) {
    return (
      <main className="desktop-cloud-main-view desktop-cloud-auth-main-view">
        <div className="desktop-cloud-page-shell">
          <CloudProjectBrowserSignedOut
            apiBaseUrl={cloudApiBaseUrl}
            accountEmail={accountEmail}
            onSignedIn={(session) => onCloudSessionChange(session)}
            onSignedOut={() => onCloudSessionChange(null)}
            onRefresh={onRefresh}
          />
        </div>
      </main>
    );
  }

  if (!effectiveCloudSession) {
    return (
      <main className="desktop-cloud-main-view">
        <div className="desktop-cloud-page-shell">
          <CloudWorkspaceLoadingState label={t("cloud.loading.session")} />
        </div>
      </main>
    );
  }

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
        {(!inCloudGlobalSection || activeSection === "overview") && cloudData.error && <div className="desktop-cloud-main-alert">{formatCloudMessage(cloudData.error, t)}</div>}
        {!inCloudGlobalSection && cloudData.warning && <div className="desktop-cloud-main-alert">{formatCloudMessage(cloudData.warning, t)}</div>}
        {!inCloudGlobalSection && cloudBackupError && <div className="desktop-cloud-main-alert">{cloudBackupError}</div>}
        {!inCloudGlobalSection && cloudAction.error && <div className="desktop-cloud-main-alert">{formatCloudMessage(cloudAction.error, t)}</div>}
        {!inCloudGlobalSection && cloudAction.notice && <div className="desktop-cloud-main-alert success">{formatCloudMessage(cloudAction.notice, t)}</div>}

        <CloudRouter
          workspace={workspace}
          status={status}
          cloudSession={effectiveCloudSession}
          cloudApiBaseUrl={cloudApiBaseUrl}
          cloudRemote={cloudRemote}
          cloudData={cloudData}
          projectContext={projectContext}
          activeSection={activeSection}
          accountEmail={accountEmail}
          accountConnected={accountConnected}
          branchName={branchName}
          localChangeCount={localChangeCount}
          loading={loading}
          cloudBackupLoading={cloudBackupLoading}
          onSessionChange={onCloudSessionChange}
          onBackupWorkspace={handleBackupWorkspace}
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
      </div>
    </main>
  );
}

function shouldLoadAggregateProjectDetails(section: CloudWorkspaceSection): boolean {
  // History uses a dedicated route-scoped history hook; skip aggregate details reload there.
  return section === "contents"
    || section === "claude"
    || section === "access"
    || section === "automation"
    || section === "mcp-cli"
    || section === "git-sync";
}
