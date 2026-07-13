import { Copy, RefreshCw } from "lucide-react";
import { useLocalization } from "@puppyone/localization";
import type { GitStatusSnapshot, PuppyoneWorkspaceConfig } from "../../../types/electron";
import { getPuppyoneRemote, maskRemoteUrl, parsePuppyoneRemote } from "../../source-control";
import { SettingsSectionHeader, SettingsSubsection, SettingsValueRow } from "../components";
import { PuppyoneWorkspaceConfigSettings } from "../PuppyoneWorkspaceConfigSettings";
import { remoteKindLabel, shortCommit } from "../utils";

type RepositorySettingsBaseProps = {
  status: GitStatusSnapshot | null;
  loading: boolean;
  error: string | null;
  copiedRemoteKey: string | null;
  copyError: string | null;
  onCopyRemoteUrl: (key: string, url: string) => Promise<void>;
  onRefresh: () => void;
};

export function CloudHostingSettingsView({
  status,
  loading,
  error,
  copiedRemoteKey,
  copyError,
  puppyoneConfig,
  puppyoneConfigLoading,
  puppyoneConfigSaving,
  puppyoneConfigError,
  cloudEnabled,
  onCopyRemoteUrl,
  onPuppyoneConfigChange,
  onRegeneratePuppyoneProjectId,
  onRefresh,
}: RepositorySettingsBaseProps & {
  puppyoneConfig: PuppyoneWorkspaceConfig | null;
  puppyoneConfigLoading: boolean;
  puppyoneConfigSaving: boolean;
  puppyoneConfigError: string | null;
  cloudEnabled: boolean;
  onPuppyoneConfigChange: (config: PuppyoneWorkspaceConfig) => Promise<PuppyoneWorkspaceConfig | null>;
  onRegeneratePuppyoneProjectId: () => Promise<PuppyoneWorkspaceConfig | null>;
}) {
  const { t } = useLocalization();
  const remotes = status?.remotes ?? [];
  const puppyoneRemote = getPuppyoneRemote(status);
  const cloudRemote = puppyoneRemote?.remote ?? null;
  const cloudInfo = puppyoneRemote?.info ?? null;
  const cloudRemoteUrl = puppyoneRemote?.rawUrl ?? null;
  const cloudCopyKey = cloudRemoteUrl ? `${cloudRemote?.name}:${cloudRemoteUrl}` : "";
  const usesPuppyoneCloud = cloudEnabled
    && (puppyoneConfig?.sync.sourceOfTruth.service === "puppyone"
      || (puppyoneConfig?.backup.enabled === true && puppyoneConfig.backup.service === "puppyone"));

  return (
    <section className="desktop-utility-view desktop-settings-view">
      <div className="desktop-utility-body desktop-settings-body">
        <div className="desktop-settings-section">
          <SettingsHeading
            title={t("settings.cloud.title")}
            detail={t("settings.cloud.detail")}
            loading={loading}
            onRefresh={onRefresh}
          />
          {error ? (
            <div className="desktop-utility-empty danger">{error}</div>
          ) : loading && !status ? (
            <div className="desktop-utility-empty">{t("settings.git.reading")}</div>
          ) : status && !status.isRepo ? (
            <div className="desktop-utility-empty">{t("settings.git.notRepository")}</div>
          ) : (
            <>
              <PuppyoneWorkspaceConfigSettings
                config={puppyoneConfig}
                remotes={remotes}
                branches={status?.branches ?? []}
                currentBranchName={status?.branch ?? null}
                cloudEnabled={cloudEnabled}
                loading={puppyoneConfigLoading}
                saving={puppyoneConfigSaving}
                error={puppyoneConfigError}
                onChange={onPuppyoneConfigChange}
                onRegenerateProjectId={onRegeneratePuppyoneProjectId}
              />
              {usesPuppyoneCloud && (
                <SettingsSubsection title={t("settings.cloud.connectionTitle")}>
                  <SettingsValueRow
                    label={t("settings.cloud.status")}
                    value={t(cloudInfo ? "settings.cloud.connected" : "settings.shared.notConfigured")}
                    tone={cloudInfo ? "success" : undefined}
                  />
                  {cloudInfo ? (
                    <>
                      <SettingsValueRow label={t("settings.cloud.remote")} value={cloudRemote?.name ?? "puppyone"} />
                      <SettingsValueRow label={t("settings.cloud.host")} value={cloudInfo.host} />
                      <SettingsValueRow
                        label={cloudInfo.kind === "access-point"
                          ? t("settings.cloud.accessKey")
                          : cloudInfo.kind === "scope"
                            ? t("settings.cloud.projectScope")
                            : t("settings.cloud.project")}
                        value={cloudInfo.displayId}
                        monospace
                      />
                      <SettingsValueRow
                        label={t("settings.cloud.connectionUrl")}
                        value={cloudRemoteUrl ? maskRemoteUrl(cloudRemoteUrl) : t("settings.shared.notConfigured")}
                        title={cloudRemoteUrl ?? undefined}
                        monospace
                        action={cloudRemoteUrl ? (
                          <CopyAction
                            copied={copiedRemoteKey === cloudCopyKey}
                            onClick={() => void onCopyRemoteUrl(cloudCopyKey, cloudRemoteUrl)}
                          />
                        ) : undefined}
                      />
                    </>
                  ) : (
                    <div className="desktop-settings-muted-row">{t("settings.shared.notConfigured")}</div>
                  )}
                </SettingsSubsection>
              )}
              {copyError && <div className="desktop-utility-empty danger">{copyError}</div>}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export function GitSettingsView({
  status,
  loading,
  error,
  copiedRemoteKey,
  copyError,
  onCopyRemoteUrl,
  onRefresh,
}: RepositorySettingsBaseProps) {
  const { t } = useLocalization();
  const currentBranch = status?.branches.find((branch) => branch.current) ?? null;
  const remotes = status?.remotes ?? [];
  const localBranchCount = status?.branches.filter((branch) => !branch.remote).length ?? 0;
  const remoteBranchCount = status?.branches.filter((branch) => branch.remote).length ?? 0;

  return (
    <section className="desktop-utility-view desktop-settings-view">
      <div className="desktop-utility-body desktop-settings-body">
        <div className="desktop-settings-section">
          <SettingsHeading
            title={t("settings.git.title")}
            detail={t("settings.git.detail")}
            loading={loading}
            onRefresh={onRefresh}
          />
          {error ? (
            <div className="desktop-utility-empty danger">{error}</div>
          ) : loading && !status ? (
            <div className="desktop-utility-empty">{t("settings.git.reading")}</div>
          ) : status && !status.isRepo ? (
            <div className="desktop-utility-empty">{t("settings.git.notRepository")}</div>
          ) : (
            <>
              <SettingsSubsection title={t("settings.git.repository")}>
                <SettingsValueRow label={t("settings.git.branch")} value={status?.branch ?? t("settings.git.detached")} />
                <SettingsValueRow
                  label={t("settings.git.branches")}
                  value={t("settings.git.branchCounts", { localCount: localBranchCount, remoteCount: remoteBranchCount })}
                />
                <SettingsValueRow label={t("settings.git.upstream")} value={currentBranch?.upstream ?? t("settings.shared.notConfigured")} />
                <SettingsValueRow
                  label={t("settings.git.syncStatus")}
                  value={currentBranch?.upstream
                    ? t("settings.git.syncCounts", { ahead: currentBranch.ahead, behind: currentBranch.behind })
                    : t("settings.git.localOnly")}
                />
                <SettingsValueRow label="HEAD" value={status?.headCommitId ? shortCommit(status.headCommitId) : t("settings.git.noCommits")} monospace />
              </SettingsSubsection>
              <SettingsSubsection title={t("settings.git.remotes")}>
                {remotes.length === 0 ? (
                  <div className="desktop-settings-muted-row">{t("settings.git.noRemotes")}</div>
                ) : remotes.map((remote) => {
                  const copyUrl = remote.fetchUrl ?? remote.pushUrl;
                  const copyKey = `${remote.name}:${copyUrl ?? ""}`;
                  const remoteInfo = parsePuppyoneRemote(copyUrl);
                  const pushUrlDiffers = Boolean(remote.fetchUrl && remote.pushUrl && remote.fetchUrl !== remote.pushUrl);
                  return (
                    <div className="desktop-settings-remote-setting" key={remote.name}>
                      <div className="desktop-settings-remote-setting-main">
                        <strong dir="auto">{remote.name}</strong>
                        <span className={`desktop-settings-badge ${remoteInfo ? "connected" : ""}`}>
                          {remoteInfo ? "puppyone" : remoteKindLabel(copyUrl)}
                        </span>
                      </div>
                      <div className="desktop-settings-remote-setting-meta">
                        <span>{t("settings.git.remoteBranchCount", { count: remote.branches.length })}</span>
                      </div>
                      <div className="desktop-settings-remote-setting-url">
                        <code dir="ltr" title={copyUrl ?? ""}>{copyUrl ? maskRemoteUrl(copyUrl) : t("settings.shared.notConfigured")}</code>
                        {pushUrlDiffers && remote.pushUrl && <small title={remote.pushUrl}>{t("settings.git.pushUrlDiffers")}</small>}
                      </div>
                      <CopyAction
                        copied={copiedRemoteKey === copyKey}
                        disabled={!copyUrl}
                        onClick={() => copyUrl ? void onCopyRemoteUrl(copyKey, copyUrl) : undefined}
                      />
                    </div>
                  );
                })}
              </SettingsSubsection>
              {copyError && <div className="desktop-utility-empty danger">{copyError}</div>}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function SettingsHeading({
  title,
  detail,
  loading,
  onRefresh,
}: {
  title: string;
  detail?: string;
  loading: boolean;
  onRefresh: () => void;
}) {
  const { t } = useLocalization();
  return (
    <div className="desktop-settings-heading-row">
      <SettingsSectionHeader title={title} detail={detail} />
      <button className="desktop-settings-action" type="button" onClick={onRefresh} disabled={loading}>
        <RefreshCw size={14} className={loading ? "spin" : undefined} />
        <span>{t("common.action.refresh")}</span>
      </button>
    </div>
  );
}

function CopyAction({
  copied,
  disabled = false,
  onClick,
}: {
  copied: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const { t } = useLocalization();
  return (
    <button className="desktop-settings-row-action" type="button" disabled={disabled} onClick={onClick}>
      <Copy size={13} />
      <span>{t(copied ? "common.action.copied" : "common.action.copy")}</span>
    </button>
  );
}
