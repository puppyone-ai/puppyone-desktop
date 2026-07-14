import { Cloud, ExternalLink, GitBranch, RefreshCw, Settings, Users } from "lucide-react";
import type { Workspace } from "@puppyone/shared-ui";
import { bidiIsolate } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import type {
  DesktopCloudRepoIdentity,
  DesktopCloudScope,
} from "../../lib/cloudApi";
import { openCloudApp } from "../../lib/cloudApi";
import type { getPuppyoneRemote } from "../source-control/remotes";
import {
  buildCloudAccessPointIdentity,
  buildCloudAccessPointScope,
  formatSidebarAccount,
} from "./utils";
import type { CloudWorkspaceSection } from "./types";
import { getCloudSectionDescriptor } from "./navigation";
import {
  CloudMainMetric,
  CloudMainSection,
  CloudWebEmpty,
  CloudWebPage,
} from "./components/shared";
import { CloudAccessPointAccessSection } from "./sections/access/AccessPointSection";
import { CloudGitSyncSection } from "./sections/GitSyncSection";
import { CloudMcpCliSection } from "./sections/McpCliSection";

export { CloudProjectRecoveryState } from "./states/CloudProjectRecoveryState";

export function CloudSignedOutState({
  workspace,
  onOpenDetails,
}: {
  workspace: Workspace;
  onOpenDetails: () => void;
}) {
  const { t } = useLocalization();
  return (
    <CloudMainSection
      title={t("cloud.productName")}
      count={t("cloud.auth.signInRequired")}
      action={<button className="desktop-cloud-row-action primary" type="button" onClick={onOpenDetails}>{t("cloud.auth.signIn")}</button>}
    >
      <div className="desktop-cloud-empty-state">
        <span><Cloud size={22} /></span>
        <div>
          <strong>{t("cloud.state.workspaceLocalOnly", { workspace: bidiIsolate(workspace.name) })}</strong>
          <p>{t("cloud.state.signInBeforeSwitch")}</p>
        </div>
      </div>
    </CloudMainSection>
  );
}

export function CloudRemoteConnectedWorkspace({
  workspace,
  activeSection,
  branchName,
  localChangeCount,
  cloudRemote,
  loading,
  userEmail,
  onRefresh,
  onOpenGitSettings,
}: {
  workspace: Workspace;
  activeSection: CloudWorkspaceSection;
  branchName: string;
  localChangeCount: number;
  cloudRemote: NonNullable<ReturnType<typeof getPuppyoneRemote>>;
  loading: boolean;
  userEmail: string | null;
  onRefresh: () => Promise<void>;
  onOpenGitSettings: () => void;
}) {
  const { t } = useLocalization();
  const section = getCloudSectionDescriptor(activeSection, t);

  if (cloudRemote.info.kind === "access-point" && cloudRemote.info.accessKey) {
    const accessPointScope = buildCloudAccessPointScope(cloudRemote.info.accessKey);
    const accessPointIdentity = buildCloudAccessPointIdentity(cloudRemote);

    if (activeSection === "access") {
      return (
        <CloudAccessPointAccessSection
          scope={accessPointScope}
          identity={accessPointIdentity}
          branchName={branchName}
          cloudRemote={cloudRemote}
        />
      );
    }

    if (activeSection === "mcp-cli") {
      return (
        <CloudMcpCliSection
          projectId=""
          identity={accessPointIdentity}
          scopes={[accessPointScope]}
          mcpEndpoints={[]}
          loading={loading}
          onOpenProject={() => openCloudApp("/projects")}
        />
      );
    }

    if (activeSection === "git-sync") {
      return (
        <CloudGitSyncSection
          workspace={workspace}
          status={null}
          identity={accessPointIdentity}
          cloudRemote={cloudRemote}
          accountConnected={Boolean(userEmail)}
          onOpenGitSettings={onOpenGitSettings}
          onRefresh={onRefresh}
        />
      );
    }
  }

  const Icon = activeSection === "overview" ? Cloud : section.icon;

  return (
    <>
      <CloudMainSection
        title={activeSection === "overview" ? t("cloud.common.cloudSource") : section.title}
        count={t(loading ? "cloud.common.resolving" : "cloud.status.connected")}
        action={(
          <>
            <button className="desktop-cloud-row-action" type="button" onClick={() => void onRefresh()}>
              <RefreshCw size={13} className={loading ? "spin" : undefined} />
              <span>{t("cloud.common.refresh")}</span>
            </button>
            <button className="desktop-cloud-row-action" type="button" onClick={onOpenGitSettings}>
              <GitBranch size={13} />
              <span>{t("cloud.route.git-sync.title")}</span>
            </button>
          </>
        )}
      >
        <div className="desktop-cloud-project-overview">
          <div>
            <span>{t("cloud.state.hostedGitRemote")}</span>
            <strong title={cloudRemote.rawUrl} dir="auto">{workspace.name}</strong>
            <p>
              {t("cloud.state.remoteConnectedDescription", { section: section.title })}
            </p>
          </div>
          <div className="desktop-cloud-sync-summary">
            <CloudMainMetric label={t("cloud.common.source")} value={t("cloud.productName")} tone="ready" />
            <CloudMainMetric label={t("cloud.git.remote")} value={cloudRemote.info.displayId} tone="ready" mono />
            <CloudMainMetric label={t("cloud.git.branch")} value={branchName} />
          </div>
        </div>
      </CloudMainSection>

      <CloudMainSection
        title={section.title}
        count={t(loading ? "cloud.common.resolving" : "cloud.state.remoteConnected")}
        action={<button className="desktop-cloud-row-action" type="button" onClick={() => openCloudApp("/projects")}>{t("cloud.common.openCloud")}</button>}
      >
        <div className="desktop-cloud-empty-state">
          <span><Icon size={22} /></span>
          <div>
            <strong>{t(loading ? "cloud.state.resolvingMetadata" : "cloud.state.gitRemoteConnected")}</strong>
            <p>
              {t("cloud.state.remoteSourceDescription", {
                remote: bidiIsolate(cloudRemote.info.displayId),
                count: localChangeCount,
              })}
            </p>
          </div>
        </div>
      </CloudMainSection>
    </>
  );
}

export function CloudUnmappedWorkspace({
  workspace,
  activeSection,
  accountEmail,
  branchName,
  localChangeCount,
  backupLoading,
  cloudRemote,
  onBackupWorkspace,
}: {
  workspace: Workspace;
  activeSection: CloudWorkspaceSection;
  accountEmail: string | null;
  branchName: string;
  localChangeCount: number;
  backupLoading: boolean;
  cloudRemote: ReturnType<typeof getPuppyoneRemote>;
  onBackupWorkspace: () => void;
}) {
  const { formatNumber, t } = useLocalization();
  if (activeSection !== "overview") {
    return (
      <CloudUnmappedSection
        workspace={workspace}
        activeSection={activeSection}
        backupLoading={backupLoading}
        cloudRemote={cloudRemote}
        onBackupWorkspace={onBackupWorkspace}
      />
    );
  }

  return (
    <>
      <CloudMainSection
        title={t("cloud.state.localWorkspace")}
        count={t(cloudRemote ? "cloud.state.remoteNotMatched" : "cloud.state.notBackedUp")}
        action={(
          <button
            className="desktop-cloud-row-action primary"
            type="button"
            disabled={backupLoading}
            onClick={onBackupWorkspace}
          >
            {t(backupLoading ? "cloud.common.connecting" : "cloud.state.backupAndConnect")}
          </button>
        )}
      >
        <div className="desktop-cloud-project-overview">
          <div>
            <span>{t("cloud.state.localWorkingCopy")}</span>
            <strong title={workspace.path} dir="auto">{workspace.name}</strong>
            <p>{t("cloud.state.localOnlyDescription")}</p>
          </div>
          <div className="desktop-cloud-sync-summary">
            <CloudMainMetric label={t("cloud.common.account")} value={accountEmail ?? t("cloud.account.signedIn")} tone="ready" />
            <CloudMainMetric label={t("cloud.git.branch")} value={branchName} />
            <CloudMainMetric label={t("cloud.git.localChanges")} value={formatNumber(localChangeCount)} tone={localChangeCount > 0 ? "warning" : undefined} />
          </div>
        </div>
      </CloudMainSection>
    </>
  );
}

export function CloudUnmappedSection({
  workspace,
  activeSection,
  backupLoading,
  cloudRemote,
  onBackupWorkspace,
}: {
  workspace: Workspace;
  activeSection: CloudWorkspaceSection;
  backupLoading: boolean;
  cloudRemote: ReturnType<typeof getPuppyoneRemote>;
  onBackupWorkspace: () => void;
}) {
  const { t } = useLocalization();
  const section = getCloudSectionDescriptor(activeSection, t);
  const remoteLabel = cloudRemote?.info.displayId ?? t("cloud.state.noRemote");
  const Icon = section.icon;

  return (
    <>
      <CloudMainSection
        title={section.title}
        count={t("cloud.project.required")}
        action={(
          <button
            className="desktop-cloud-row-action primary"
            type="button"
            disabled={backupLoading}
            onClick={onBackupWorkspace}
          >
            {t(backupLoading ? "cloud.common.connecting" : "cloud.state.backupAndConnect")}
          </button>
        )}
      >
        <div className="desktop-cloud-empty-state">
          <span><Icon size={22} /></span>
          <div>
            <strong>{t("cloud.state.sectionNeedsProject", { section: section.title })}</strong>
            <p>{t("cloud.state.connectWorkspaceFirst", {
              description: section.description,
              workspace: bidiIsolate(workspace.name),
              remote: bidiIsolate(remoteLabel),
            })}</p>
          </div>
        </div>
      </CloudMainSection>
    </>
  );
}

export function CloudProjectWebSection({
  icon: Icon,
  title,
  description,
  primaryLabel,
  onOpen,
}: {
  projectId: string;
  icon: typeof Cloud;
  title: string;
  description: string;
  primaryLabel: string;
  onOpen: () => void;
}) {
  const { t } = useLocalization();
  return (
    <CloudWebPage
      title={title}
      count={t("cloud.common.web")}
      action={<button className="desktop-cloud-row-action primary" type="button" onClick={onOpen}>{primaryLabel}</button>}
    >
      <CloudWebEmpty icon={Icon} title={title} detail={description} />
    </CloudWebPage>
  );
}
