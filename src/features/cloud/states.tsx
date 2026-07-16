import {
  AlertTriangle,
  FilePenLine,
  GitBranch,
  GitCommitHorizontal,
  RefreshCw,
} from "lucide-react";
import type { Workspace } from "@puppyone/shared-ui";
import { useLocalization } from "@puppyone/localization/react";
import {
  CloudPublishCloudMark,
  CloudPublishFolderMark,
} from "./components/CloudPublishHeroMarks";
import {
  CloudWebEmpty,
  CloudWebPage,
} from "./components/shared";
import type { CloudPublishReadiness } from "./workspace/cloudPublishReadiness";

const PUPPYONE_CLOUD_DEFAULT_BRANCH = "main";

export { CloudProjectRecoveryState } from "./states/CloudProjectRecoveryState";

export function CloudLocalOnlyWorkspace({
  workspace,
  accountEmail,
  branchName,
  totalCommits,
  localChangeCount,
  localChangeCountIsMinimum = false,
  publishReadiness,
  isGitRepository,
  hasHeadCommit,
  hasCurrentBranch,
  publishLoading,
  publishPending = false,
  publishError = null,
  publishCanRetry = false,
  projectInitialized = false,
  onPublishWorkspace,
}: {
  workspace: Workspace;
  accountEmail: string | null;
  branchName: string;
  totalCommits: number;
  localChangeCount: number;
  localChangeCountIsMinimum?: boolean;
  publishReadiness?: CloudPublishReadiness;
  isGitRepository: boolean;
  hasHeadCommit: boolean;
  hasCurrentBranch: boolean;
  publishLoading: boolean;
  publishPending?: boolean;
  publishError?: string | null;
  publishCanRetry?: boolean;
  projectInitialized?: boolean;
  onPublishWorkspace: () => void;
}) {
  const { t } = useLocalization();
  const publishBusy = publishLoading || publishPending;
  const waitingForSignIn = publishPending && !accountEmail && !publishLoading;
  const publishing = publishLoading || (publishPending && Boolean(accountEmail));
  const resolvedReadiness = publishReadiness ?? (
    !isGitRepository
      ? "repository-required"
      : !hasHeadCommit
        ? "commit-required"
        : !hasCurrentBranch
          ? "branch-required"
          : "ready"
  );
  const readinessMessage = resolvedReadiness === "repository-required"
    ? t("cloud.initialize.repositoryRequired")
    : resolvedReadiness === "commit-required"
      ? t("cloud.initialize.commitRequired")
      : resolvedReadiness === "branch-required"
        ? t("cloud.initialize.branchRequired")
        : null;
  const readyToPush = readinessMessage === null;
  const destinationBranchName = PUPPYONE_CLOUD_DEFAULT_BRANCH;
  const cloudStatus = t(
    projectInitialized && publishing
      ? "cloud.initialize.pushing"
      : projectInitialized
        ? "cloud.initialize.initializedPushIncomplete"
        : waitingForSignIn
      ? "cloud.initialize.waitingForSignIn"
      : publishing
        ? "cloud.initialize.initializing"
        : "cloud.initialize.notInitialized",
  );
  return (
    <div className="desktop-cloud-publish-container">
      {waitingForSignIn && (
        <div className="desktop-cloud-main-alert info" role="status">
          {t("cloud.state.publishSignInPending")}
        </div>
      )}
      {publishError && (
        <div className="desktop-cloud-main-alert" role="alert">
          {publishError}
        </div>
      )}
      <section className="desktop-cloud-publish-card" aria-label={t("cloud.initialize.title")}>
        <div className="desktop-cloud-publish-hero">
          <div
            className="desktop-cloud-publish-symbol local"
            aria-label={t(isGitRepository ? "cloud.initialize.localRepository" : "cloud.initialize.localFolder")}
          >
            <div className="desktop-cloud-publish-symbol-mark">
              <CloudPublishFolderMark className="desktop-cloud-publish-symbol-icon" />
            </div>
            <div className="desktop-cloud-publish-details local">
              <p className="desktop-cloud-publish-project" title={workspace.path} dir="auto">
                {workspace.name}
              </p>
              <ul className="desktop-cloud-publish-meta">
                <li>
                  <GitBranch size={13} aria-hidden="true" />
                  <bdi>{branchName}</bdi>
                </li>
                <li>
                  <GitCommitHorizontal size={13} aria-hidden="true" />
                  <span>{t("cloud.branches.commitCount", { count: totalCommits })}</span>
                </li>
                <li className={localChangeCount > 0 ? "warning" : undefined}>
                  <FilePenLine size={13} aria-hidden="true" />
                  <span>
                    {t(
                      localChangeCountIsMinimum
                        ? "cloud.initialize.localChangeCountAtLeast"
                        : "cloud.initialize.localChangeCount",
                      { count: localChangeCount },
                    )}
                  </span>
                </li>
              </ul>
            </div>
          </div>

          <div className="desktop-cloud-publish-arrow" aria-label={t("cloud.initialize.push")}>
            <svg
              className="desktop-cloud-publish-arrow-horizontal"
              viewBox="0 0 240 24"
              preserveAspectRatio="none"
              focusable="false"
              aria-hidden="true"
            >
              <path
                d="M1 12 H228 M216 4 L228 12 L216 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <svg
              className="desktop-cloud-publish-arrow-vertical"
              viewBox="0 0 24 96"
              preserveAspectRatio="none"
              focusable="false"
              aria-hidden="true"
            >
              <path
                d="M12 1 V84 M4 72 L12 84 L20 72"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>

          <div className="desktop-cloud-publish-symbol cloud" aria-label="PuppyOne Cloud">
            <div className="desktop-cloud-publish-symbol-mark">
              <CloudPublishCloudMark className="desktop-cloud-publish-symbol-icon" />
            </div>
            <div className="desktop-cloud-publish-details cloud">
              <p className="desktop-cloud-publish-project">
                {t("cloud.initialize.newCloudProject")}
              </p>
              <ul className="desktop-cloud-publish-meta">
                <li>
                  <span className="desktop-cloud-publish-status">{cloudStatus}</span>
                </li>
                <li>
                  <GitBranch size={13} aria-hidden="true" />
                  <bdi>{destinationBranchName}</bdi>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {readinessMessage && (
          <div className="desktop-cloud-publish-summary blocked" role="alert">
            <strong>{readinessMessage}</strong>
          </div>
        )}

        <div className="desktop-cloud-publish-actions">
          <button
            className="desktop-cloud-row-action primary desktop-cloud-publish-primary"
            type="button"
            aria-busy={publishBusy || undefined}
            disabled={publishBusy || !readyToPush}
            onClick={onPublishWorkspace}
          >
            {t(
              publishing
                ? "cloud.initialize.initializingAndPushing"
                : waitingForSignIn
                  ? "cloud.initialize.waitingForSignIn"
                  : publishCanRetry
                    ? "cloud.initialize.retryPush"
                    : "cloud.initialize.initializeAndPush",
            )}
          </button>
        </div>
      </section>
    </div>
  );
}

export function CloudLocalGitStatusError({
  error,
  loading,
  onRetry,
}: {
  error: string;
  loading: boolean;
  onRetry: () => void;
}) {
  const { t } = useLocalization();
  return (
    <div className="desktop-cloud-publish-container">
      <section className="desktop-cloud-publish-status-error" role="alert">
        <div className="desktop-cloud-empty-state">
          <span aria-hidden="true"><AlertTriangle size={22} /></span>
          <div>
            <strong>{t("cloud.initialize.gitStatusErrorTitle")}</strong>
            <p>{error}</p>
          </div>
        </div>
        <button className="desktop-cloud-row-action" type="button" disabled={loading} onClick={onRetry}>
          <RefreshCw size={13} className={loading ? "spin" : undefined} aria-hidden="true" />
          <span>{t("cloud.common.retry")}</span>
        </button>
      </section>
    </div>
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
