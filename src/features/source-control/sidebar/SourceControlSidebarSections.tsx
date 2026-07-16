import { ArrowDown, ArrowUp, ArrowUpRight, Clock3, Cloud, Github, Plus, X } from "lucide-react";
import {
  SidebarEmptyState,
  SidebarResizeHandle,
  type FileIconThemeId,
  type SidebarResizeIntent,
} from "@puppyone/shared-ui";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useLocalization, type MessageFormatter } from "@puppyone/localization";
import type { GitStatusSnapshot } from "../../../types/electron";
import { openExternalUrl } from "../../../lib/localFiles";
import {
  SourceControlPreviewResourceList,
  SourceControlSectionHeader,
} from "../components";
import type {
  GitActionIconKind,
  GitHostingIdentity,
  GitSyncState,
  GitWorkingSelection,
} from "../types";
import { getGitScmSyncSection } from "../viewModel";
import type { GitSidebarPanelId } from "./useGitSidebarPanelLayout";

export function GitSectionCollapse({ expanded, children }: { expanded: boolean; children: ReactNode }) {
  return (
    <div className={`desktop-git-section-collapse ${expanded ? "expanded" : "collapsed"}`}>
      <div className="desktop-git-section-collapse-inner">{children}</div>
    </div>
  );
}

export function PuppyoneCloudProviderSection({
  status,
  mergeCount,
  fileIconTheme,
  selectedWorkingFile,
  disabled,
  operationLoading,
  primaryAction,
  onSelectWorkingFile,
  onPull,
}: {
  status: GitStatusSnapshot | null;
  mergeCount: number;
  fileIconTheme: FileIconThemeId;
  selectedWorkingFile: GitWorkingSelection | null;
  disabled: boolean;
  operationLoading: string | null;
  primaryAction: boolean;
  onSelectWorkingFile: (selection: GitWorkingSelection) => void;
  onPull: () => Promise<boolean>;
}) {
  const { t } = useLocalization();
  const remote = status?.sourceControl.remote ?? null;
  const cloudUpdateCount = remote?.behind ?? 0;
  const cloudPreviewResources = cloudUpdateCount > 0 ? remote?.incomingPreview ?? [] : [];
  const downloadBlockedByConflicts = mergeCount > 0;
  const canDownload = Boolean(remote?.canPull) && !downloadBlockedByConflicts;
  const downloadTitle = downloadBlockedByConflicts
    ? t("source-control.cloud.resolveBeforeDownload")
    : canDownload
      ? t("source-control.cloud.downloadTitle")
      : t("source-control.cloud.upToDate");

  return (
    <section className="desktop-git-cloud-provider-section">
      <SourceControlSectionHeader
        title="PuppyOne Cloud"
        count={cloudUpdateCount}
        highlightCount={cloudUpdateCount > 0}
        leadingIcon={<Cloud size={14} strokeWidth={2} />}
        action={(
          <GitOperationButton
            className="desktop-git-commit-push-action"
            title={downloadTitle}
            disabled={disabled || !canDownload}
            icon="download"
            label={t("source-control.action.download")}
            loadingKey="pull"
            loadingLabel={t("source-control.action.downloading")}
            operationLoading={operationLoading}
            primary={primaryAction}
            onClick={() => void onPull()}
          />
        )}
      />
      <div className="desktop-git-cloud-provider-body">
        {cloudPreviewResources.length > 0 ? (
          <SourceControlPreviewResourceList
            resources={cloudPreviewResources}
            fileIconTheme={fileIconTheme}
            selectedWorkingFile={selectedWorkingFile}
            origin="remote"
            ariaLabel={t("source-control.preview.cloud")}
            onSelectWorkingFile={onSelectWorkingFile}
          />
        ) : (
          <SidebarEmptyState compact className="desktop-git-section-empty">
            {cloudUpdateCount > 0
              ? t("source-control.cloud.updateCount", { count: cloudUpdateCount })
              : t("source-control.status.empty")}
          </SidebarEmptyState>
        )}
      </div>
    </section>
  );
}

export function getCommittedSummary(count: number, actionLabel: string, t: MessageFormatter) {
  return t("source-control.committed.ready", { count, action: actionLabel });
}

export function GitHostingIdentityRow({ identity }: { identity: GitHostingIdentity }) {
  const { t } = useLocalization();
  const { label, href } = identity;
  return (
    <div className="desktop-git-section-row desktop-git-hosting-identity-row" aria-label={t("source-control.hosting.repository")}>
      {href ? (
        <a
          className="desktop-git-section-title desktop-git-hosting-identity-link"
          href={href}
          title={href}
          onClick={(event) => {
            event.preventDefault();
            void openExternalUrl(href).catch((error) => console.warn("Unable to open GitHub repository:", error));
          }}
        >
          <span className="desktop-git-section-leading-icon"><Github size={14} strokeWidth={2} aria-hidden="true" /></span>
          <bdi>{label}</bdi>
          <ArrowUpRight size={12} aria-hidden="true" />
        </a>
      ) : (
        <div className="desktop-git-section-title desktop-git-hosting-identity-text">
          <span className="desktop-git-section-leading-icon"><Github size={14} strokeWidth={2} aria-hidden="true" /></span>
          <bdi>{label}</bdi>
        </div>
      )}
    </div>
  );
}

export function GitSidebarSectionResizer({
  previous,
  next,
  active,
  onPointerDown,
  onKeyboardResize,
}: {
  previous: GitSidebarPanelId;
  next: GitSidebarPanelId;
  active: boolean;
  onPointerDown: (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
  onKeyboardResize: (
    previous: GitSidebarPanelId,
    next: GitSidebarPanelId,
    intent: SidebarResizeIntent,
    accelerated: boolean,
  ) => void;
}) {
  const { t } = useLocalization();
  return (
    <SidebarResizeHandle
      className={`desktop-git-section-resizer ${active ? "active" : ""}`}
      data-previous-panel={previous}
      data-next-panel={next}
      orientation="horizontal"
      label={t("source-control.sidebar.resize")}
      onPointerDown={onPointerDown}
      onKeyboardResize={(intent, accelerated) => onKeyboardResize(previous, next, intent, accelerated)}
    />
  );
}

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
  return (
    <section className="desktop-git-backup-card">
      <div className="desktop-git-backup-copy"><span>{t("source-control.backup.reminder")}</span></div>
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
      {cloudBackupError && <div className="desktop-git-backup-error">{cloudBackupError}</div>}
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
  const section = getGitScmSyncSection(status, state, t);
  return (
    <section className={`desktop-git-remote-status desktop-git-scm-sync ${section.copy.tone}`}>
      <SourceControlSectionHeader
        title={section.copy.title}
        count={section.copy.count}
        highlightCount={section.copy.count > 0}
        expanded={expanded}
        onToggle={onToggleExpanded}
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
        <GitSectionCollapse expanded={expanded}>
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
        <GitSectionCollapse expanded={expanded}>
          <div className="desktop-git-preview-summary">{section.fallbackSummary}</div>
        </GitSectionCollapse>
      )}
    </section>
  );
}

export function GitOperationButton({
  className,
  title,
  disabled,
  icon,
  label,
  loadingKey,
  loadingLabel,
  operationLoading,
  primary = false,
  onClick,
}: {
  className: string;
  title: string;
  disabled: boolean;
  icon: GitActionIconKind;
  label: string;
  loadingKey: string;
  loadingLabel: string;
  operationLoading: string | null;
  primary?: boolean;
  onClick: () => void;
}) {
  const loading = operationLoading === loadingKey;
  const buttonClassName = [
    "desktop-git-operation-button",
    className,
    primary ? "is-primary" : "",
    loading ? "is-loading" : "",
  ].filter(Boolean).join(" ");
  return (
    <button
      className={buttonClassName}
      type="button"
      title={title}
      aria-label={loading ? loadingLabel : label}
      aria-busy={loading || undefined}
      disabled={disabled}
      onClick={onClick}
    >
      {loading ? <SourceControlDots /> : renderGitActionIcon(icon)}
      <span className="desktop-git-operation-label">{loading ? loadingLabel : label}</span>
    </button>
  );
}

export function GitHistoryShortcut({
  active,
  count,
  onSelect,
}: {
  active: boolean;
  count: number;
  onSelect: () => void;
}) {
  const { t, formatNumber } = useLocalization();
  return (
    <section className="desktop-git-history-drawer">
      <button
        className={`desktop-git-history-drawer-header ${active ? "active" : ""}`}
        type="button"
        aria-pressed={active}
        onClick={onSelect}
      >
        <Clock3 size={13} />
        <span>{t("source-control.history.title")}</span>
        <small>{formatNumber(count)}</small>
      </button>
    </section>
  );
}

function SourceControlDots() {
  const { t } = useLocalization();
  return (
    <span className="desktop-git-loading-dots" data-puppy-loader="dots" role="status" aria-label={t("common.status.loading")}>
      {[0, 1, 2].map((index) => <span key={index} />)}
    </span>
  );
}

function renderGitActionIcon(icon: GitActionIconKind) {
  if (icon === "plus") return <Plus size={15} strokeWidth={2.25} aria-hidden="true" />;
  const Icon = icon === "upload" ? ArrowUp : ArrowDown;
  return <Icon className="desktop-git-action-arrow" size={15} strokeWidth={2.25} aria-hidden="true" />;
}
