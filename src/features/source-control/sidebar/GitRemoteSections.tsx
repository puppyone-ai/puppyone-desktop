import { Cloud, X } from "lucide-react";
import { useLocalization } from "@puppyone/localization";
import type { GitStatusSnapshot } from "../../../types/electron";
import { SourceControlSectionHeader } from "../components";
import type { GitSyncState } from "../types";
import { getGitScmSyncSection } from "../viewModel";
import {
  GitOperationButton,
  SourceControlDots,
} from "./GitSidebarPrimitives";

export function GitRemotePrompt({
  state,
  disabled,
  cloudBackupLoading,
  cloudBackupError,
  dismissed,
  cloudEnabled,
  onDismiss,
  onStartPuppyoneBackup,
}: {
  state: GitSyncState;
  disabled: boolean;
  cloudBackupLoading: boolean;
  cloudBackupError: string | null;
  dismissed: boolean;
  cloudEnabled: boolean;
  onDismiss: () => void;
  onStartPuppyoneBackup: () => void;
}) {
  const { t } = useLocalization();
  if (!cloudEnabled || !state.setupRequired || (dismissed && !cloudBackupError)) return null;
  const message = cloudBackupError || t("source-control.backup.reminder");
  return (
    <section
      className={`desktop-git-backup-card${cloudBackupError ? " is-error" : ""}`}
      role={cloudBackupError ? "alert" : undefined}
    >
      <div className="desktop-git-backup-copy"><span>{message}</span></div>
      <button
        className="desktop-git-backup-dismiss"
        type="button"
        aria-label={t("source-control.backup.dismissAriaLabel")}
        title={t("source-control.action.dismiss")}
        disabled={cloudBackupLoading}
        onClick={onDismiss}
      >
        <X size={13} />
      </button>
      <button
        className="desktop-git-backup-action"
        type="button"
        aria-busy={cloudBackupLoading || undefined}
        disabled={disabled || cloudBackupLoading}
        onClick={onStartPuppyoneBackup}
      >
        {cloudBackupLoading ? <SourceControlDots /> : <Cloud size={13} />}
        <span>{t("source-control.backup.getCloud")}</span>
      </button>
    </section>
  );
}

export function GitScmSyncRow({
  status,
  state,
  disabled,
  operationLoading,
  primaryAction,
  onPull,
  onPush,
  onPublish,
  blockedByConflicts,
}: {
  status: GitStatusSnapshot | null;
  state: GitSyncState;
  disabled: boolean;
  operationLoading: string | null;
  primaryAction: boolean;
  onPull: () => Promise<boolean>;
  onPush: () => Promise<boolean>;
  onPublish: () => Promise<boolean>;
  blockedByConflicts: boolean;
}) {
  const { t } = useLocalization();
  const section = getGitScmSyncSection(status, state, t, { blockedByConflicts });
  return (
    <section className={`desktop-git-remote-status desktop-git-scm-sync ${section.copy.tone}`}>
      <SourceControlSectionHeader
        title={section.copy.title}
        count={section.copy.count}
        highlightCount={section.copy.count > 0}
        action={section.action ? (
          <GitOperationButton
            className="desktop-git-remote-action"
            disabled={disabled || section.action.disabled}
            title={section.action.title}
            icon={section.action.icon}
            label={section.action.label}
            loadingKey={section.action.kind}
            loadingLabel={section.action.loadingLabel}
            operationLoading={operationLoading}
            primary={primaryAction}
            onClick={() => {
              if (section.action?.kind === "pull") void onPull();
              if (section.action?.kind === "push") void onPush();
              if (section.action?.kind === "publish") void onPublish();
            }}
          />
        ) : null}
      />
    </section>
  );
}
