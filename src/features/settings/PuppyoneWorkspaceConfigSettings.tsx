import { useEffect, useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import type { GitRemoteSummary, GitStatusSnapshot, PuppyoneBackendService, PuppyoneWorkspaceConfig } from "../../types/electron";
import { parsePuppyoneRemote } from "../source-control/remotes";
import { SettingsGroup } from "./components";
import { remoteKindLabel } from "./utils";

export function PuppyoneWorkspaceConfigSettings({
  config,
  remotes,
  branches,
  currentBranchName,
  cloudEnabled,
  loading,
  saving,
  error,
  onChange,
}: {
  config: PuppyoneWorkspaceConfig | null;
  remotes: GitRemoteSummary[];
  branches: GitStatusSnapshot["branches"];
  currentBranchName: string | null;
  cloudEnabled: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
  onChange: (config: PuppyoneWorkspaceConfig) => Promise<PuppyoneWorkspaceConfig | null>;
}) {
  const [draft, setDraft] = useState<PuppyoneWorkspaceConfig>(() => normalizePuppyoneConfigDraft(config, cloudEnabled));
  const [localError, setLocalError] = useState<string | null>(null);
  const branchNames = branches
    .filter((branch) => !branch.remote)
    .map((branch) => branch.name);
  const watchedBranchListId = "desktop-puppyone-watched-branch-options";
  const backupBranchListId = "desktop-puppyone-backup-branch-options";
  const normalizedDraft = normalizePuppyoneConfigDraft(draft, cloudEnabled);
  const savedConfig = normalizePuppyoneConfigDraft(config, cloudEnabled);
  const dirty = !samePuppyoneConfig(normalizedDraft, savedConfig);
  const sourceService = draft.sync.sourceOfTruth.service;
  const sourceRemoteNames = getRemoteNamesForService(sourceService, remotes);
  const backupRemoteNames = getRemoteNamesForService(draft.backup.service, remotes);
  const sourceRemoteValue = sourceRemoteNames.includes(draft.sync.sourceOfTruth.remote ?? "")
    ? draft.sync.sourceOfTruth.remote ?? ""
    : "";
  const backupRemoteValue = backupRemoteNames.includes(draft.backup.remote ?? "")
    ? draft.backup.remote ?? ""
    : "";
  const sourceServiceOptions: Array<{
    value: PuppyoneBackendService;
    label: string;
    detail: string;
    available: boolean;
  }> = [
    {
      value: "puppyone",
      label: "Puppyone Cloud",
      detail: "Simple workspace sync managed by Puppyone.",
      available: cloudEnabled,
    },
    {
      value: "github",
      label: "GitHub",
      detail: "Use the standard GitHub flow and Git remotes.",
      available: true,
    },
  ];
  const showSourceGitHints = sourceService !== "puppyone";
  const showBackupDetails = draft.backup.enabled;
  const showCloudProject = cloudEnabled
    && (sourceService === "puppyone" || (draft.backup.enabled && draft.backup.service === "puppyone"));

  useEffect(() => {
    setDraft(normalizePuppyoneConfigDraft(config, cloudEnabled));
    setLocalError(null);
  }, [cloudEnabled, config]);

  const updateSourceOfTruthConfig = (nextSourceOfTruth: Partial<PuppyoneWorkspaceConfig["sync"]["sourceOfTruth"]>) => {
    setDraft((current) => {
      const normalized = normalizePuppyoneConfigDraft(current, cloudEnabled);
      const sourceOfTruth = {
        ...normalized.sync.sourceOfTruth,
        ...nextSourceOfTruth,
      };
      return {
        ...normalized,
        sync: {
          sourceOfTruth,
        },
        git: {
          ...normalized.git,
          ...(Object.prototype.hasOwnProperty.call(nextSourceOfTruth, "remote") ? { primaryRemote: sourceOfTruth.remote } : {}),
          ...(Object.prototype.hasOwnProperty.call(nextSourceOfTruth, "branch") ? { watchedBranch: sourceOfTruth.branch } : {}),
        },
      };
    });
  };

  const updateBackupConfig = (nextBackup: Partial<PuppyoneWorkspaceConfig["backup"]>) => {
    setDraft((current) => {
      const normalized = normalizePuppyoneConfigDraft(current, cloudEnabled);
      return {
        ...normalized,
        backup: {
          ...normalized.backup,
          ...nextBackup,
        },
      };
    });
  };

  const updateCloudConfig = (nextCloud: Partial<PuppyoneWorkspaceConfig["cloud"]>) => {
    setDraft((current) => {
      const normalized = normalizePuppyoneConfigDraft(current, cloudEnabled);
      return {
        ...normalized,
        cloud: {
          ...normalized.cloud,
          ...nextCloud,
        },
      };
    });
  };

  const selectSourceService = (service: PuppyoneBackendService) => {
    const normalizedService = normalizeBackendServiceDraft(service, cloudEnabled);
    updateSourceOfTruthConfig({
      service: normalizedService,
      remote: inferBackupRemote(normalizedService, remotes, draft.sync.sourceOfTruth.remote),
      branch: normalizedService === "puppyone" ? null : draft.sync.sourceOfTruth.branch,
    });
  };

  const saveConfig = async () => {
    setLocalError(null);
    try {
      const saved = await onChange(normalizedDraft);
      if (saved) setDraft(normalizePuppyoneConfigDraft(saved, cloudEnabled));
    } catch (saveError) {
      setLocalError(saveError instanceof Error ? saveError.message : String(saveError));
    }
  };

  return (
    <SettingsGroup>
      {loading && !config ? (
        <div className="desktop-settings-muted-row">Reading Puppyone config...</div>
      ) : (
        <>
          <div className="desktop-settings-row desktop-settings-row-control desktop-puppyone-config-row desktop-hosting-service-panel">
            <span className="desktop-settings-label-stack">
              <strong>Source service</strong>
              <small>Sync authority for this workspace.</small>
            </span>
            <div className="desktop-hosting-service-options" aria-label="Source service">
              {sourceServiceOptions.filter((option) => option.available).map((option) => (
                <button
                  className={`desktop-hosting-service-option ${sourceService === option.value ? "active" : ""}`}
                  type="button"
                  disabled={saving}
                  key={option.value}
                  title={option.detail}
                  onClick={() => selectSourceService(option.value)}
                >
                  <strong>{option.label}</strong>
                </button>
              ))}
            </div>
          </div>

          {showSourceGitHints && (
            <>
              <label className="desktop-settings-row desktop-settings-row-control desktop-puppyone-config-row">
                <span className="desktop-settings-label-stack">
                  <strong>Git remote</strong>
                  <small>Remote used for sync state.</small>
                </span>
                <select
                  className="desktop-settings-select"
                  value={sourceRemoteValue}
                  disabled={saving}
                  onChange={(event) => updateSourceOfTruthConfig({ remote: normalizeSettingsText(event.target.value) })}
                >
                  <option value="">Auto</option>
                  {sourceRemoteNames.map((remoteName) => (
                    <option value={remoteName} key={remoteName}>{remoteName}</option>
                  ))}
                </select>
              </label>

              <label className="desktop-settings-row desktop-settings-row-control desktop-puppyone-config-row">
                <span className="desktop-settings-label-stack">
                  <strong>Git branch</strong>
                  <small>Empty uses the current branch.</small>
                </span>
                <input
                  className="desktop-settings-text-input"
                  list={watchedBranchListId}
                  value={draft.sync.sourceOfTruth.branch ?? ""}
                  placeholder={currentBranchName && currentBranchName !== "detached" ? currentBranchName : "current branch"}
                  disabled={saving}
                  onChange={(event) => updateSourceOfTruthConfig({ branch: normalizeSettingsText(event.target.value) })}
                />
                <datalist id={watchedBranchListId}>
                  {branchNames.map((branchName) => (
                    <option value={branchName} key={branchName} />
                  ))}
                </datalist>
              </label>
            </>
          )}

          <div className="desktop-settings-row desktop-settings-row-control desktop-puppyone-config-row">
            <span className="desktop-settings-label-stack">
              <strong>Backup enabled</strong>
              <small>Use a separate backup target.</small>
            </span>
            <label className="desktop-settings-switch">
              <input
                type="checkbox"
                checked={draft.backup.enabled}
                disabled={saving}
                onChange={(event) => updateBackupConfig({ enabled: event.target.checked })}
              />
              <span aria-hidden="true" />
            </label>
          </div>

          {showBackupDetails && (
            <>
              <label className="desktop-settings-row desktop-settings-row-control desktop-puppyone-config-row">
                <span className="desktop-settings-label-stack">
                  <strong>Backup target</strong>
                  <small>Service used for backup.</small>
                </span>
                <select
                  className="desktop-settings-select"
                  value={draft.backup.service}
                  disabled={saving}
                  onChange={(event) => {
                    const service = normalizeBackendServiceDraft(event.target.value, cloudEnabled);
                    updateBackupConfig({
                      service,
                      remote: inferBackupRemote(service, remotes, draft.backup.remote),
                    });
                  }}
                >
                  {cloudEnabled && <option value="puppyone">Puppyone Cloud</option>}
                  <option value="github">GitHub</option>
                </select>
              </label>

              {draft.backup.service !== "puppyone" && (
                <>
                  <label className="desktop-settings-row desktop-settings-row-control desktop-puppyone-config-row">
                    <span className="desktop-settings-label-stack">
                      <strong>Backup Git remote</strong>
                      <small>Empty chooses automatically.</small>
                    </span>
                    <select
                      className="desktop-settings-select"
                      value={backupRemoteValue}
                      disabled={saving}
                      onChange={(event) => updateBackupConfig({ remote: normalizeSettingsText(event.target.value) })}
                    >
                      <option value="">Auto</option>
                      {backupRemoteNames.map((remoteName) => (
                        <option value={remoteName} key={remoteName}>{remoteName}</option>
                      ))}
                    </select>
                  </label>

                  <label className="desktop-settings-row desktop-settings-row-control desktop-puppyone-config-row">
                    <span className="desktop-settings-label-stack">
                      <strong>Backup Git branch</strong>
                      <small>Empty uses the current branch.</small>
                    </span>
                    <input
                      className="desktop-settings-text-input"
                      list={backupBranchListId}
                      value={draft.backup.branch ?? ""}
                      placeholder={currentBranchName && currentBranchName !== "detached" ? currentBranchName : "current branch"}
                      disabled={saving}
                      onChange={(event) => updateBackupConfig({ branch: normalizeSettingsText(event.target.value) })}
                    />
                    <datalist id={backupBranchListId}>
                      {branchNames.map((branchName) => (
                        <option value={branchName} key={branchName} />
                      ))}
                    </datalist>
                  </label>
                </>
              )}
            </>
          )}

          {showCloudProject && (
            <label className="desktop-settings-row desktop-settings-row-control desktop-puppyone-config-row">
              <span className="desktop-settings-label-stack">
                <strong>Cloud project id</strong>
                <small>Project identifier for Puppyone Cloud.</small>
              </span>
              <input
                className="desktop-settings-text-input"
                value={draft.cloud.projectId ?? ""}
                placeholder="Not set"
                disabled={saving}
                onChange={(event) => updateCloudConfig({ projectId: normalizeSettingsText(event.target.value) })}
              />
            </label>
          )}

          <div className="desktop-puppyone-config-footer">
            <span>{error ?? localError ?? (dirty ? "Unsaved changes" : "Config is up to date")}</span>
            <div>
              <button
                className="desktop-settings-row-action"
                type="button"
                disabled={!dirty || saving}
                onClick={() => setDraft(savedConfig)}
              >
                <RefreshCw size={13} />
                <span>Reset</span>
              </button>
              <button
                className="desktop-settings-row-action desktop-settings-save-action"
                type="button"
                disabled={!dirty || saving}
                onClick={() => void saveConfig()}
              >
                <Check size={13} />
                <span>{saving ? "Saving" : "Save"}</span>
              </button>
            </div>
          </div>
        </>
      )}
    </SettingsGroup>
  );
}

function normalizePuppyoneConfigDraft(config: PuppyoneWorkspaceConfig | null, cloudEnabled = true): PuppyoneWorkspaceConfig {
  const sourceOfTruthService = normalizeBackendServiceDraft(
    config?.sync?.sourceOfTruth?.service ?? config?.backup?.service,
    cloudEnabled,
  );
  const isPuppyoneSource = sourceOfTruthService === "puppyone";
  const sourceOfTruthRemote =
    normalizeSettingsText(config?.sync?.sourceOfTruth?.remote)
    ?? normalizeSettingsText(config?.git?.primaryRemote)
    ?? normalizeSettingsText(config?.backup?.remote);
  const sourceOfTruthBranch = isPuppyoneSource
    ? null
    : normalizeSettingsText(config?.sync?.sourceOfTruth?.branch)
      ?? normalizeSettingsText(config?.git?.watchedBranch)
      ?? normalizeSettingsText(config?.backup?.branch);

  return {
    version: 1,
    sync: {
      sourceOfTruth: {
        service: sourceOfTruthService,
        remote: sourceOfTruthRemote,
        branch: sourceOfTruthBranch,
      },
    },
    git: {
      primaryRemote: normalizeSettingsText(config?.git?.primaryRemote) ?? sourceOfTruthRemote,
      watchedBranch: isPuppyoneSource ? null : normalizeSettingsText(config?.git?.watchedBranch) ?? sourceOfTruthBranch,
    },
    backup: {
      enabled: config?.backup?.enabled === true,
      service: normalizeBackendServiceDraft(config?.backup?.service ?? sourceOfTruthService, cloudEnabled),
      remote: normalizeSettingsText(config?.backup?.remote) ?? sourceOfTruthRemote,
      branch: normalizeSettingsText(config?.backup?.branch) ?? (isPuppyoneSource ? null : sourceOfTruthBranch),
    },
    cloud: {
      projectId: normalizeSettingsText(config?.cloud?.projectId),
    },
    ...(config?.updatedAt ? { updatedAt: config.updatedAt } : {}),
  };
}

function samePuppyoneConfig(left: PuppyoneWorkspaceConfig, right: PuppyoneWorkspaceConfig) {
  return left.sync.sourceOfTruth.service === right.sync.sourceOfTruth.service
    && left.sync.sourceOfTruth.remote === right.sync.sourceOfTruth.remote
    && left.sync.sourceOfTruth.branch === right.sync.sourceOfTruth.branch
    && left.git.primaryRemote === right.git.primaryRemote
    && left.git.watchedBranch === right.git.watchedBranch
    && left.backup.enabled === right.backup.enabled
    && left.backup.service === right.backup.service
    && left.backup.remote === right.backup.remote
    && left.backup.branch === right.backup.branch
    && left.cloud.projectId === right.cloud.projectId;
}

function normalizeBackendServiceDraft(value: string | null | undefined, cloudEnabled = true): PuppyoneBackendService {
  if (value === "puppyone") return cloudEnabled ? "puppyone" : "github";
  return value === "github" ? value : "github";
}

function inferBackupRemote(
  service: PuppyoneBackendService,
  remotes: GitRemoteSummary[],
  fallback: string | null,
) {
  if (service === "puppyone") {
    return remotes.find((remote) => parsePuppyoneRemote(remote.fetchUrl ?? remote.pushUrl))?.name
      ?? remotes.find((remote) => remote.name.toLowerCase() === "puppyone")?.name
      ?? fallback
      ?? null;
  }

  if (service === "github") {
    return remotes.find((remote) => remoteKindLabel(remote.fetchUrl ?? remote.pushUrl) === "GitHub")?.name
      ?? null;
  }

  return fallback ?? null;
}

function getRemoteNamesForService(service: PuppyoneBackendService, remotes: GitRemoteSummary[]) {
  if (service === "puppyone") {
    return remotes
      .filter((remote) => Boolean(parsePuppyoneRemote(remote.fetchUrl ?? remote.pushUrl)))
      .map((remote) => remote.name);
  }

  if (service === "github") {
    return remotes
      .filter((remote) => remoteKindLabel(remote.fetchUrl ?? remote.pushUrl) === "GitHub")
      .map((remote) => remote.name);
  }

  return remotes.map((remote) => remote.name);
}

function normalizeSettingsText(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
