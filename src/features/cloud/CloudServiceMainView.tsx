import { useEffect, useMemo, useRef, useState } from "react";
import {
  getCloudRepoIdentity,
  openCloudApp,
  type DesktopCloudProject,
} from "../../lib/cloudApi";
import type { CloudServiceMainViewProps, CloudWorkspaceSection } from "./types";
import { getAttachedCloudProjectId } from "./attachment";
import { getCloudAuthEmail, getCloudAuthSession, isCloudAuthBlocking, useCloudSessionForEnvironment } from "./auth";
import { useDesktopCloudData } from "./data";
import { resolveCloudEnvironment } from "./environment";
import { copyText, shellQuote } from "./utils";
import { CloudWorkspaceLoadingState } from "./components/shared";
import { CloudProjectBrowserSignedOut } from "./components/ProjectBrowser";
import { CloudRouter } from "./routes/CloudRouter";
import { getCloudRouteWebPath, isCloudAccountSection, normalizeCloudSection } from "./routes/cloudRoutes";

export function CloudServiceMainView({
  workspace,
  status,
  puppyoneConfig,
  cloudApiBaseUrl: desktopApiBaseUrl,
  cloudSession,
  sessionRestoring = false,
  attachment = null,
  onCloudSessionChange,
  activeSection,
  selectedProjectId = null,
  loading,
  error,
  cloudBackupLoading,
  cloudBackupError,
  onStartPuppyoneBackup,
  onConfigureCloudRemote,
  onSelectProjectId,
  onSelectSection,
  onRefresh,
  onOpenDetails,
  onOpenGitSettings,
}: CloudServiceMainViewProps) {
  const cloudEnvironment = useMemo(
    () => resolveCloudEnvironment({ status, puppyoneConfig, desktopApiBaseUrl }),
    [desktopApiBaseUrl, puppyoneConfig, status],
  );
  const cloudRemote = cloudEnvironment.cloudRemote;
  const cloudApiBaseUrl = cloudEnvironment.apiBaseUrl;
  const cloudAuthState = useCloudSessionForEnvironment({
    cloudSession,
    sessionRestoring,
    environment: cloudEnvironment,
    onCloudSessionChange,
  });
  const effectiveCloudSession = getCloudAuthSession(cloudAuthState);
  const loadAggregateProjectDetails = shouldLoadAggregateProjectDetails(activeSection);
  const boundProjectId = attachment ? getAttachedCloudProjectId(attachment) : null;
  const cloudData = useDesktopCloudData({
    session: effectiveCloudSession,
    cloudEnvironment,
    selectedProjectId,
    boundProjectId,
    onSessionChange: onCloudSessionChange,
    workspaceRevisionKey: status?.headCommitId ?? null,
    loadProjectDetails: loadAggregateProjectDetails,
  });
  const [cloudAction, setCloudAction] = useState<{
    kind: "backup" | "connect" | "copy" | null;
    projectId: string | null;
    message: string | null;
    error: string | null;
  }>({ kind: null, projectId: null, message: null, error: null });

  const accountEmail = getCloudAuthEmail(cloudAuthState);
  const actionContextKey = `${workspace.path}\n${accountEmail ?? ""}\n${cloudApiBaseUrl ?? ""}`;
  const actionContextRef = useRef(actionContextKey);
  const actionRequestRef = useRef<symbol | null>(null);
  actionContextRef.current = actionContextKey;
  useEffect(() => {
    actionRequestRef.current = null;
    onSelectProjectId?.(null);
    setCloudAction({ kind: null, projectId: null, message: null, error: null });
  }, [workspace.path, accountEmail, cloudApiBaseUrl, onSelectProjectId]);

  useEffect(() => {
    const normalizedSection = normalizeCloudSection(activeSection);
    if (normalizedSection !== activeSection) {
      onSelectSection(normalizedSection);
    }
  }, [activeSection, onSelectSection]);

  if (cloudAuthState.status === "restoring" && !effectiveCloudSession) {
    return (
      <main className="desktop-cloud-main-view">
        <div className="desktop-cloud-page-shell">
          <CloudWorkspaceLoadingState label="Loading Cloud session" />
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

    setCloudAction({ kind: null, projectId: null, message: null, error: null });
    onStartPuppyoneBackup();
  };

  const handleConnectProject = async (project: DesktopCloudProject) => {
    if (!effectiveCloudSession || actionRequestRef.current || cloudBackupLoading) return;
    const request = Symbol("connect-cloud-project");
    const requestContext = actionContextKey;
    actionRequestRef.current = request;
    setCloudAction({ kind: "connect", projectId: project.id, message: null, error: null });
    try {
      const identity = await getCloudRepoIdentity(effectiveCloudSession, project.id, onCloudSessionChange, cloudApiBaseUrl);
      if (actionContextRef.current !== requestContext) return;
      const configuredStatus = await onConfigureCloudRemote(identity.url, project.id);
      if (actionContextRef.current !== requestContext) return;
      if (!configuredStatus) {
        throw new Error("This workspace is no longer available for Cloud attachment.");
      }
      // Attach completes the binding; browse selection is no longer needed.
      onSelectProjectId?.(null);
      setCloudAction({
        kind: null,
        projectId: project.id,
        message: `${project.name} is linked to this folder. Cloud tools are ready under Access.`,
        error: null,
      });
      onSelectSection("access");
    } catch (actionError) {
      if (actionContextRef.current !== requestContext) return;
      setCloudAction({
        kind: null,
        projectId: project.id,
        message: null,
        error: actionError instanceof Error ? actionError.message : "Unable to connect this project.",
      });
    } finally {
      if (actionRequestRef.current === request) actionRequestRef.current = null;
    }
  };

  const handleCopyCloneCommand = async (project: DesktopCloudProject) => {
    if (!effectiveCloudSession || actionRequestRef.current || cloudBackupLoading) return;
    const request = Symbol("copy-cloud-clone-command");
    const requestContext = actionContextKey;
    actionRequestRef.current = request;
    setCloudAction({ kind: "copy", projectId: project.id, message: null, error: null });
    try {
      const identity = await getCloudRepoIdentity(effectiveCloudSession, project.id, onCloudSessionChange, cloudApiBaseUrl);
      if (actionContextRef.current !== requestContext) return;
      await copyText(`git clone ${identity.url} ${shellQuote(project.name)}`);
      if (actionContextRef.current !== requestContext) return;
      setCloudAction({ kind: null, projectId: project.id, message: "Clone command copied.", error: null });
    } catch (actionError) {
      if (actionContextRef.current !== requestContext) return;
      setCloudAction({
        kind: null,
        projectId: project.id,
        message: null,
        error: actionError instanceof Error ? actionError.message : "Unable to copy clone command.",
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
          <CloudWorkspaceLoadingState label="Loading Cloud session" />
        </div>
      </main>
    );
  }

  const accountConnected = Boolean(accountEmail);
  const currentBranch = status?.branches.find((branch) => branch.current) ?? null;
  const localChangeCount =
    (status?.stagedEntries.length ?? 0) +
    (status?.unstagedEntries.length ?? 0) +
    (status?.untrackedEntries.length ?? 0);
  const branchName = currentBranch?.name ?? status?.branch ?? "No branch";
  const inCloudGlobalAccountSection = isCloudAccountSection(activeSection);

  return (
    <main className={`desktop-cloud-main-view ${activeSection === "automation" ? "desktop-cloud-automation-main-view" : ""}`}>
      <div className={`desktop-cloud-page-shell ${activeSection === "automation" ? "desktop-cloud-automation-page-shell" : ""}`}>
        {cloudAuthState.status === "offline-authenticated" && (
          <div className="desktop-cloud-main-alert">
            Cloud is offline. Your local workspace remains available; Cloud data will refresh after reconnecting.
          </div>
        )}
        {attachment?.status === "linked" && attachment.warning && (
          <div className="desktop-cloud-main-alert" role="alert">
            {attachment.warning}
          </div>
        )}
        {attachment?.status === "resolving" && (
          <div className="desktop-cloud-main-alert">
            Matching this folder to its Cloud project…
          </div>
        )}
        {!inCloudGlobalAccountSection && error && <div className="desktop-cloud-main-alert">{error}</div>}
        {!inCloudGlobalAccountSection && cloudData.error && <div className="desktop-cloud-main-alert">{cloudData.error}</div>}
        {!inCloudGlobalAccountSection && cloudData.warning && <div className="desktop-cloud-main-alert">{cloudData.warning}</div>}
        {!inCloudGlobalAccountSection && cloudBackupError && <div className="desktop-cloud-main-alert">{cloudBackupError}</div>}
        {!inCloudGlobalAccountSection && cloudAction.error && <div className="desktop-cloud-main-alert">{cloudAction.error}</div>}
        {!inCloudGlobalAccountSection && cloudAction.message && <div className="desktop-cloud-main-alert success">{cloudAction.message}</div>}

        <CloudRouter
          workspace={workspace}
          status={status}
          cloudSession={effectiveCloudSession}
          cloudApiBaseUrl={cloudApiBaseUrl}
          cloudRemote={cloudRemote}
          cloudData={cloudData}
          attachment={attachment}
          selectedProjectId={selectedProjectId}
          activeSection={activeSection}
          accountEmail={accountEmail}
          accountConnected={accountConnected}
          branchName={branchName}
          localChangeCount={localChangeCount}
          loading={loading}
          cloudBackupLoading={cloudBackupLoading}
          cloudAction={cloudAction}
          onSessionChange={onCloudSessionChange}
          onBackupWorkspace={handleBackupWorkspace}
          onConnectProject={handleConnectProject}
          onCopyCloneCommand={handleCopyCloneCommand}
          onOpenProject={handleOpenProject}
          onOpenGitSettings={onOpenGitSettings}
          onSelectProject={(project) => {
            onSelectProjectId?.(project.id);
            onSelectSection("contents");
          }}
          onSelectSection={onSelectSection}
          onRetryBinding={() => {
            void cloudData.reload();
            onRefresh();
          }}
          onUseAnotherAccount={() => onCloudSessionChange(null)}
        />
      </div>
    </main>
  );
}

function shouldLoadAggregateProjectDetails(section: CloudWorkspaceSection): boolean {
  // History uses a dedicated route-scoped history hook; skip aggregate details reload there.
  return section === "overview"
    || section === "contents"
    || section === "access"
    || section === "automation"
    || section === "mcp-cli"
    || section === "git-sync";
}
