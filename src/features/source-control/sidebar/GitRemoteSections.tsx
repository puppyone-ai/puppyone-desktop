import { Cloud, X } from "lucide-react";
import type { FileIconThemeId } from "@puppyone/shared-ui";
import { useId } from "react";
import { useLocalization } from "@puppyone/localization";
import type { GitStatusSnapshot } from "../../../types/electron";
import {
  SourceControlPreviewResourceList,
  SourceControlSectionHeader,
} from "../components";
import type { GitSyncState, GitWorkingSelection } from "../types";
import { getGitScmSyncSection } from "../viewModel";
import {
  GitOperationButton,
  GitSectionCollapse,
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
  fileIconTheme,
  expanded,
  selectedWorkingFile,
  disabled,
  operationLoading,
  primaryAction,
  onToggleExpanded,
  onSelectWorkingFile,
  onPull,
  onPush,
  onPublish,
}: {
  status: GitStatusSnapshot | null;
  state: GitSyncState;
  fileIconTheme: FileIconThemeId;
  expanded: boolean;
  selectedWorkingFile: GitWorkingSelection | null;
  disabled: boolean;
  operationLoading: string | null;
  primaryAction: boolean;
  onToggleExpanded: () => void;
  onSelectWorkingFile: (selection: GitWorkingSelection) => void;
  onPull: () => Promise<boolean>;
  onPush: () => Promise<boolean>;
  onPublish: () => Promise<boolean>;
}) {
  const { t } = useLocalization();
  const bodyId = useId();
  const section = getGitScmSyncSection(status, state, t);
  const hasBody = section.previewResources.length > 0 || Boolean(section.fallbackSummary);
  return (
    <section className={`desktop-git-remote-status desktop-git-scm-sync ${section.copy.tone}`}>
      <SourceControlSectionHeader
        title={section.copy.title}
        count={section.copy.count}
        summaryResources={section.previewResources}
        highlightCount={section.copy.count > 0}
        controlsId={hasBody ? bodyId : undefined}
        expanded={expanded}
        onToggle={hasBody ? onToggleExpanded : undefined}
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
      {section.previewResources.length > 0 && (
        <GitSectionCollapse id={bodyId} expanded={expanded}>
          <SourceControlPreviewResourceList
            resources={section.previewResources}
            fileIconTheme={fileIconTheme}
            selectedWorkingFile={selectedWorkingFile}
            origin="remote"
            ariaLabel={t("source-control.preview.remote")}
            onSelectWorkingFile={onSelectWorkingFile}
          />
        </GitSectionCollapse>
      )}
      {section.previewResources.length === 0 && section.fallbackSummary && (
        <GitSectionCollapse id={bodyId} expanded={expanded}>
          <div className="desktop-git-preview-summary" data-po-scrollbar="sidebar">
            {section.fallbackSummary}
          </div>
        </GitSectionCollapse>
      )}
    </section>
  );
}
