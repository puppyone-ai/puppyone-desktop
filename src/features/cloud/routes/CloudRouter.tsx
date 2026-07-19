import { useLocalization } from "@puppyone/localization/react";
import type { Workspace } from "@puppyone/shared-ui";
import type { DesktopCloudSession } from "../../../lib/cloudApi";
import type { GitStatusSnapshot } from "../../../types/electron";
import type { getCanonicalPuppyoneRemote } from "../../source-control/remotes";
import { getResolvedCloudProjectId, isCloudContextRecovery, type ProjectCloudContext } from "../context";
import type { DesktopCloudDataState } from "../data";
import type { CloudWorkspaceSection } from "../types";
import { CloudWorkspaceLoadingState } from "../components/shared";
import { CloudProjectRecoveryState } from "../states/CloudProjectRecoveryState";
import { formatCloudMessage } from "../cloudPresentation";
import {
  CloudGlobalRouteOutlet,
  isCloudGlobalRouteSection,
} from "./CloudGlobalRouteOutlet";
import { CloudProjectRouteOutlet } from "./CloudProjectRouteOutlet";

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
  loading,
  onSessionChange,
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
  loading: boolean;
  onSessionChange: (session: DesktopCloudSession | null) => void;
  onOpenProject: (projectId: string, section?: CloudWorkspaceSection) => void;
  onOpenGitSettings: () => void;
  onSelectSection: (section: CloudWorkspaceSection) => void;
  onRetryContext?: () => void;
  onUseAnotherAccount?: () => void;
  onRemoveCloudRemote?: () => void;
}) {
  const { t } = useLocalization();

  if (isCloudGlobalRouteSection(activeSection)) {
    return (
      <CloudGlobalRouteOutlet
        activeSection={activeSection}
        cloudSession={cloudSession}
        cloudApiBaseUrl={cloudApiBaseUrl}
        cloudData={cloudData}
        accountEmail={accountEmail}
        onSessionChange={onSessionChange}
        onOpenProject={onOpenProject}
      />
    );
  }

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

  const projectId = getResolvedCloudProjectId(
    projectContext ?? { status: "local-only", projectId: null },
  ) ?? cloudData.contextProjectId;
  if (!projectId) {
    return <CloudWorkspaceLoadingState label={t("cloud.state.sectionNeedsProject")} />;
  }

  return (
    <CloudProjectRouteOutlet
      activeSection={activeSection}
      workspace={workspace}
      status={status}
      cloudSession={cloudSession}
      cloudApiBaseUrl={cloudApiBaseUrl}
      cloudRemote={cloudRemote}
      cloudData={cloudData}
      projectId={projectId}
      project={cloudData.contextProject ?? cloudData.activeProject ?? { id: projectId, name: workspace.name }}
      loading={loading}
      accountConnected={accountConnected}
      onSessionChange={onSessionChange}
      onSelectSection={onSelectSection}
      onOpenProject={onOpenProject}
      onOpenGitSettings={onOpenGitSettings}
      onRefresh={cloudData.reload}
      onRemoveCloudRemote={projectContext?.status === "resolved" ? onRemoveCloudRemote : undefined}
    />
  );
}
