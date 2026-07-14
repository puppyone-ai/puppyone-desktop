import { Cloud } from "lucide-react";
import type { Workspace } from "@puppyone/shared-ui";
import { bidiIsolate } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import type { getPuppyoneRemote } from "../source-control/remotes";
import type { CloudWorkspaceSection } from "./types";
import { getCloudSectionDescriptor } from "./navigation";
import {
  CloudMainMetric,
  CloudMainSection,
  CloudWebEmpty,
  CloudWebPage,
} from "./components/shared";

export { CloudProjectRecoveryState } from "./states/CloudProjectRecoveryState";

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
