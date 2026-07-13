import { Check } from "lucide-react";
import { FilePreviewIcon, type Workspace } from "@puppyone/shared-ui";
import { useLocalization } from "@puppyone/localization/react";
import type { DesktopCloudRepoIdentity } from "../../../lib/cloudApi";
import type { GitStatusSnapshot } from "../../../types/electron";
import type { getPuppyoneRemote } from "../../source-control/remotes";
import { maskRemoteUrl } from "../../source-control/remotes";
import {
  CloudAuthorityCell,
  CloudSectionLabel,
  CloudWebEmpty,
  CloudWebPage,
} from "../components/shared";
import { formatGitSyncState, formatStatusLabel, shortCommit, statusLabel } from "../utils";

export function CloudGitSyncSection({
  workspace,
  status,
  identity,
  cloudRemote,
  accountConnected,
  onOpenGitSettings,
}: {
  workspace: Workspace;
  status: GitStatusSnapshot | null;
  identity: DesktopCloudRepoIdentity | null;
  cloudRemote: ReturnType<typeof getPuppyoneRemote>;
  accountConnected: boolean;
  onOpenGitSettings: () => void;
  onRefresh: () => void;
}) {
  const { formatNumber, t } = useLocalization();
  const changeCount = status?.entries.length ?? 0;
  const branchName = status?.branch ?? t("cloud.git.noBranch");
  const remoteDisplay = cloudRemote?.info.displayId ?? (identity?.url ? maskRemoteUrl(identity.url) : t("cloud.common.missing"));
  const syncState = status?.sourceControl.remote.state ?? "no-remote";
  const canSync = Boolean(status?.sourceControl.remote.canSync || status?.sourceControl.remote.canPull || status?.sourceControl.remote.canPush);

  return (
    <CloudWebPage
      title={t("cloud.route.git-sync.title")}
      count={formatNumber(changeCount)}
      action={<button className="desktop-cloud-row-action primary" type="button" onClick={onOpenGitSettings}>{t("cloud.git.openSync")}</button>}
    >
      <div className="desktop-cloud-sync-layout">
        <section className="desktop-cloud-sync-panel primary">
          <div className="desktop-cloud-sync-panel-header">
            <span className="desktop-cloud-web-status-dot ready" aria-hidden="true" />
            <div>
              <strong>{t("cloud.productName")}</strong>
              <small>{t("cloud.git.sourceOfTruth")}</small>
            </div>
          </div>
          <div className="desktop-cloud-sync-panel-body">
            <CloudAuthorityCell label={t("cloud.git.remote")} value={remoteDisplay} tone={cloudRemote || identity?.url ? "ready" : "warning"} mono />
            <CloudAuthorityCell label={t("cloud.git.branch")} value={branchName} />
            <CloudAuthorityCell label={t("cloud.git.syncState")} value={formatGitSyncState(syncState, t)} tone={canSync ? "warning" : "ready"} />
          </div>
        </section>
        <section className="desktop-cloud-sync-panel">
          <div className="desktop-cloud-sync-panel-header">
            <span className={`desktop-cloud-web-status-dot ${changeCount > 0 ? "warning" : "ready"}`} aria-hidden="true" />
            <div>
              <strong dir="auto">{workspace.name}</strong>
              <small>{t("cloud.git.desktopWorkingCopy")}</small>
            </div>
          </div>
          <div className="desktop-cloud-sync-panel-body">
            <CloudAuthorityCell label={t("cloud.common.account")} value={t(accountConnected ? "cloud.account.signedIn" : "cloud.status.required")} tone={accountConnected ? "ready" : "warning"} />
            <CloudAuthorityCell label={t("cloud.git.localChanges")} value={formatNumber(changeCount)} tone={changeCount > 0 ? "warning" : "ready"} />
            <CloudAuthorityCell label={t("cloud.git.head")} value={status?.headCommitId ? shortCommit(status.headCommitId) : t("cloud.git.noCommit")} mono />
          </div>
        </section>
      </div>

      <div className="desktop-cloud-web-detail-block">
        <CloudSectionLabel right={<button className="desktop-cloud-row-action" type="button" onClick={onOpenGitSettings}>{t("cloud.git.reviewChanges")}</button>}>
          {t("cloud.git.workingCopy")}
        </CloudSectionLabel>
        {changeCount === 0 ? (
          <CloudWebEmpty icon={Check} title={t("cloud.git.workingTreeClean")} detail={t("cloud.git.workingTreeCleanDetail")} />
        ) : (
          <div className="desktop-cloud-file-change-list">
            {(status?.entries ?? []).slice(0, 12).map((entry) => (
              <div className="desktop-cloud-file-change-row" key={`${entry.path}:${entry.status}`}>
                <span className="desktop-cloud-file-change-icon">
                  <FilePreviewIcon name={entry.path} type={entry.path.includes(".") ? "file" : "folder"} size={22} />
                </span>
                <div>
                  <strong title={entry.path} dir="auto">{entry.path}</strong>
                  <small>{statusLabel(entry.status, t)}</small>
                </div>
                <em>{formatStatusLabel(entry.staged ? "staged" : entry.unstaged || entry.status, t)}</em>
              </div>
            ))}
          </div>
        )}
      </div>
    </CloudWebPage>
  );
}
