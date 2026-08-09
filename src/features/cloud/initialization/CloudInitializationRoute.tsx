import { useEffect, useRef, type ReactNode } from "react";
import { useLocalization } from "@puppyone/localization/react";
import type { DesktopCloudSession } from "../../../lib/cloudApi";
import type { CloudServiceMainViewProps } from "../types";
import { useCloudOrganizationData } from "../organization/CloudOrganizationTeamPage";
import { CloudWorkspaceLoadingState } from "../components/shared";
import {
  formatCloudMessage,
  type CloudMessageDescriptor,
} from "../cloudPresentation";
import { getCloudPublishReadiness } from "../workspace/cloudPublishReadiness";
import {
  CloudLocalOnlyWorkspace,
} from "./CloudInitializationView";
import { CloudLocalGitStatusError } from "./CloudLocalGitStatusError";

export function CloudInitializationRoute({
  workspace,
  status,
  session,
  apiBaseUrl,
  accountEmail,
  loading,
  error,
  cloudActionNotice,
  cloudBackupLoading,
  cloudBackupPending,
  cloudPublishError,
  cloudPublishNotice,
  cloudPublishProgress,
  cloudPublishState,
  cloudPublishStateLoading,
  onSessionChange,
  onAbandonPublish,
  onOpenSourceControl,
  onRefresh,
  onPublishWorkspace,
}: {
  workspace: CloudServiceMainViewProps["workspace"];
  status: CloudServiceMainViewProps["status"];
  session: DesktopCloudSession;
  apiBaseUrl: string | null;
  accountEmail: string | null;
  loading: boolean;
  error: string | null;
  cloudActionNotice: CloudMessageDescriptor | null;
  cloudBackupLoading: boolean;
  cloudBackupPending: boolean;
  cloudPublishError: CloudServiceMainViewProps["cloudPublishError"];
  cloudPublishNotice: CloudServiceMainViewProps["cloudPublishNotice"];
  cloudPublishProgress: CloudServiceMainViewProps["cloudPublishProgress"];
  cloudPublishState: CloudServiceMainViewProps["cloudPublishState"];
  cloudPublishStateLoading: boolean;
  onSessionChange: CloudServiceMainViewProps["onCloudSessionChange"];
  onAbandonPublish: CloudServiceMainViewProps["onAbandonPuppyoneBackup"];
  onOpenSourceControl: () => void;
  onRefresh: CloudServiceMainViewProps["onRefresh"];
  onPublishWorkspace: CloudServiceMainViewProps["onStartPuppyoneBackup"];
}) {
  const { t } = useLocalization();

  if (error) {
    return (
      <CloudInitializationFrame>
        <CloudLocalGitStatusError error={error} loading={loading} onRetry={onRefresh} />
      </CloudInitializationFrame>
    );
  }

  if (!status) {
    return (
      <CloudInitializationFrame>
        <CloudWorkspaceLoadingState label={t("cloud.initialize.loadingRepository")} />
      </CloudInitializationFrame>
    );
  }

  const branchName = status.branch ?? t("cloud.git.noBranch");
  const localChangeCount = status.entries.length;
  return (
    <CloudInitializationFrame>
      {cloudActionNotice && (
        <div className="desktop-cloud-main-alert success" role="status">
          {formatCloudMessage(cloudActionNotice, t)}
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
          onAbandonPublish={onAbandonPublish}
          onOpenSourceControl={onOpenSourceControl}
          onRefresh={onRefresh}
          onPublishWorkspace={onPublishWorkspace}
        />
      ) : (
        <AuthenticatedCloudInitialize
          workspace={workspace}
          status={status}
          session={session}
          apiBaseUrl={apiBaseUrl}
          accountEmail={accountEmail}
          branchName={branchName}
          localChangeCount={localChangeCount}
          publishLoading={cloudBackupLoading}
          publishPending={cloudBackupPending}
          publishError={cloudPublishError}
          publishProgress={cloudPublishProgress}
          onSessionChange={onSessionChange}
          onOpenSourceControl={onOpenSourceControl}
          onRefresh={onRefresh}
          onPublishWorkspace={onPublishWorkspace}
          onAbandonPublish={onAbandonPublish}
        />
      )}
    </CloudInitializationFrame>
  );
}

function CloudInitializationFrame({ children }: { children: ReactNode }) {
  return (
    <main
      className="desktop-cloud-main-view desktop-cloud-initialize-main-view"
      data-po-scrollbar="content"
    >
      <div className="desktop-cloud-page-shell">{children}</div>
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
  session: DesktopCloudSession;
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
  onRefresh: CloudServiceMainViewProps["onRefresh"];
  onPublishWorkspace: CloudServiceMainViewProps["onStartPuppyoneBackup"];
  onAbandonPublish: CloudServiceMainViewProps["onAbandonPuppyoneBackup"];
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
