import { ArrowUpRight, Cloud, Github } from "lucide-react";
import { SidebarEmptyState, type FileIconThemeId } from "@puppyone/shared-ui";
import { useId, type ReactNode } from "react";
import { useLocalization } from "@puppyone/localization";
import type { GitFileChangeSummary, GitStatusSnapshot } from "../../../types/electron";
import { openExternalUrl } from "../../../lib/localFiles";
import {
  SourceControlPreviewResourceList,
  SourceControlSectionHeader,
} from "../components";
import type {
  GitHostingIdentity,
  GitScmSyncSection,
  GitWorkingSelection,
} from "../types";
import { GitOperationButton, GitSectionCollapse } from "./GitSidebarPrimitives";

export function PuppyoneCloudProviderSection({
  status,
  mergeCount,
  expanded,
  fileIconTheme,
  selectedWorkingFile,
  disabled,
  operationLoading,
  primaryAction,
  onToggleExpanded,
  onSelectWorkingFile,
  onPull,
}: {
  status: GitStatusSnapshot | null;
  mergeCount: number;
  expanded: boolean;
  fileIconTheme: FileIconThemeId;
  selectedWorkingFile: GitWorkingSelection | null;
  disabled: boolean;
  operationLoading: string | null;
  primaryAction: boolean;
  onToggleExpanded: () => void;
  onSelectWorkingFile: (selection: GitWorkingSelection) => void;
  onPull: () => Promise<boolean>;
}) {
  const { t } = useLocalization();
  const bodyId = useId();
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
        summaryResources={cloudPreviewResources}
        highlightCount={cloudUpdateCount > 0}
        leadingIcon={<Cloud size={14} strokeWidth={2} />}
        controlsId={cloudUpdateCount > 0 ? bodyId : undefined}
        expanded={expanded}
        onToggle={cloudUpdateCount > 0 ? onToggleExpanded : undefined}
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
          <GitSectionCollapse id={bodyId} expanded={expanded}>
            <SourceControlPreviewResourceList
              resources={cloudPreviewResources}
              fileIconTheme={fileIconTheme}
              selectedWorkingFile={selectedWorkingFile}
              origin="remote"
              ariaLabel={t("source-control.preview.cloud")}
              onSelectWorkingFile={onSelectWorkingFile}
            />
          </GitSectionCollapse>
        ) : cloudUpdateCount > 0 ? (
          <GitSectionCollapse id={bodyId} expanded={expanded}>
            <SidebarEmptyState compact className="desktop-git-section-empty">
              {t("source-control.cloud.updateCount", { count: cloudUpdateCount })}
            </SidebarEmptyState>
          </GitSectionCollapse>
        ) : null}
      </div>
    </section>
  );
}

export function GitHubProviderSection({
  identity,
  section,
  incomingFileSummary,
  incomingUpdatedAt,
  mergeCount,
  disabled,
  operationLoading,
  primaryAction,
  onPull,
}: {
  identity: GitHostingIdentity;
  section: GitScmSyncSection;
  incomingFileSummary: GitFileChangeSummary;
  incomingUpdatedAt: string | null;
  mergeCount: number;
  disabled: boolean;
  operationLoading: string | null;
  primaryAction: boolean;
  onPull: () => Promise<boolean>;
}) {
  const { t } = useLocalization();
  const pullAction = section.action?.kind === "pull" ? section.action : null;
  const pullBlockedByConflicts = mergeCount > 0;

  return (
    <section className="desktop-git-cloud-provider-section desktop-git-github-provider-section">
      <GitHubChangesCard
        identity={identity}
        hasIncomingChanges={section.copy.count > 0}
        fileSummary={incomingFileSummary}
        incomingUpdatedAt={incomingUpdatedAt}
        action={pullAction ? (
          <GitOperationButton
            className="desktop-git-remote-action desktop-git-github-card-action"
            disabled={disabled || pullBlockedByConflicts || pullAction.disabled}
            title={pullBlockedByConflicts
              ? t("source-control.cloud.resolveBeforeDownload")
              : pullAction.title}
            icon={pullAction.icon}
            label={t("source-control.sync.pull")}
            loadingKey={pullAction.kind}
            loadingLabel={pullAction.loadingLabel}
            operationLoading={operationLoading}
            primary={primaryAction}
            onClick={() => void onPull()}
          />
        ) : null}
      />
    </section>
  );
}

function GitHubRepositoryLink({ identity }: { identity: GitHostingIdentity }) {
  const { t } = useLocalization();
  const { label, href } = identity;
  const repositoryName = getGitHubRepositoryName(label);
  const content = (
    <>
      <Github size={14} strokeWidth={2} aria-hidden="true" />
      <span>{repositoryName}</span>
      {href && <ArrowUpRight size={12} aria-hidden="true" />}
    </>
  );
  if (!href) return <div className="desktop-git-github-identity">{content}</div>;

  return (
    <a
      className="desktop-git-github-identity desktop-git-hosting-identity-link"
      href={href}
      aria-label={`${t("source-control.hosting.repository")}: ${label}`}
      onClick={(event) => {
        event.preventDefault();
        void openExternalUrl(href).catch((error) => console.warn("Unable to open GitHub repository:", error));
      }}
    >
      {content}
    </a>
  );
}

function getGitHubRepositoryName(label: string) {
  const normalized = label.trim().replace(/\/+$/, "").replace(/\.git$/i, "");
  return normalized.split("/").filter(Boolean).at(-1) || label;
}

function GitHubChangesCard({
  identity,
  hasIncomingChanges,
  fileSummary,
  incomingUpdatedAt,
  action,
}: {
  identity: GitHostingIdentity;
  hasIncomingChanges: boolean;
  fileSummary: GitFileChangeSummary;
  incomingUpdatedAt: string | null;
  action: ReactNode;
}) {
  const { t, formatRelativeTime } = useLocalization();
  const updateAge = formatGitRemoteUpdateAge(incomingUpdatedAt, formatRelativeTime);

  return (
    <div className="desktop-git-github-change-card">
      <GitHubRepositoryLink identity={identity} />
      <span className="desktop-git-github-summary">
        {hasIncomingChanges ? (
          <>
            {t("source-control.commit.changes", { count: fileSummary.total })}
            {updateAge && (
              <>
                <span aria-hidden="true"> · </span>
                <time
                  className="desktop-git-github-update-age"
                  dateTime={incomingUpdatedAt ?? undefined}
                >
                  {updateAge}
                </time>
              </>
            )}
          </>
        ) : t("source-control.sync.upToDate")}
      </span>
      {action}
    </div>
  );
}

function formatGitRemoteUpdateAge(
  value: string | null,
  formatRelativeTime: ReturnType<typeof useLocalization>["formatRelativeTime"],
) {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(timestamp)) return null;

  const elapsedMs = Math.max(0, Date.now() - timestamp);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  if (elapsedMs < minute) return formatRelativeTime(0, "second", { numeric: "auto" });
  if (elapsedMs < hour) return formatRelativeTime(-Math.floor(elapsedMs / minute), "minute", { numeric: "auto" });
  if (elapsedMs < day) return formatRelativeTime(-Math.floor(elapsedMs / hour), "hour", { numeric: "auto" });
  if (elapsedMs < week) return formatRelativeTime(-Math.floor(elapsedMs / day), "day", { numeric: "auto" });
  if (elapsedMs < month) return formatRelativeTime(-Math.floor(elapsedMs / week), "week", { numeric: "auto" });
  if (elapsedMs < year) return formatRelativeTime(-Math.floor(elapsedMs / month), "month", { numeric: "auto" });
  return formatRelativeTime(-Math.floor(elapsedMs / year), "year", { numeric: "auto" });
}
