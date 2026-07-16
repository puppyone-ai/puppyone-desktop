import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  Cloud,
  FilePenLine,
  Folder,
  GitBranch,
  GitCommitHorizontal,
  RefreshCw,
} from "lucide-react";
import type { Workspace } from "@puppyone/shared-ui";
import { useLocalization } from "@puppyone/localization/react";
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
  onReviewChanges,
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
  onReviewChanges: () => void;
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
      <section className="desktop-cloud-publish-card" aria-labelledby="desktop-cloud-initialize-title">
        <header className="desktop-cloud-publish-header">
          <h1 id="desktop-cloud-initialize-title">{t("cloud.initialize.title")}</h1>
          <p>{t("cloud.initialize.description")}</p>
        </header>

        <div className="desktop-cloud-publish-flow">
          <article className="desktop-cloud-publish-node local">
            <span className="desktop-cloud-publish-node-icon" aria-hidden="true">
              <Folder size={30} strokeWidth={1.65} />
            </span>
            <strong>{t(isGitRepository ? "cloud.initialize.localRepository" : "cloud.initialize.localFolder")}</strong>
            <b title={workspace.path} dir="auto">{workspace.name}</b>
            <div className="desktop-cloud-publish-node-meta">
              <span><GitBranch size={15} aria-hidden="true" /><bdi>{branchName}</bdi></span>
              <span><GitCommitHorizontal size={15} aria-hidden="true" />{t("cloud.branches.commitCount", { count: totalCommits })}</span>
              <span className={localChangeCount > 0 ? "warning" : undefined}>
                <FilePenLine size={15} aria-hidden="true" />
                {t(
                  localChangeCountIsMinimum
                    ? "cloud.initialize.localChangeCountAtLeast"
                    : "cloud.initialize.localChangeCount",
                  { count: localChangeCount },
                )}
              </span>
            </div>
          </article>

          <div className="desktop-cloud-publish-arrow" aria-label={t("cloud.initialize.push")}>
            <strong>{t("cloud.initialize.push")}</strong>
            <ArrowRight className="desktop-cloud-publish-arrow-horizontal po-directional-icon" size={42} strokeWidth={1.6} aria-hidden="true" />
            <ArrowDown className="desktop-cloud-publish-arrow-vertical" size={36} strokeWidth={1.6} aria-hidden="true" />
          </div>

          <article className="desktop-cloud-publish-node cloud">
            <span className="desktop-cloud-publish-node-icon" aria-hidden="true">
              <Cloud size={30} strokeWidth={1.65} />
            </span>
            <strong>PuppyOne Cloud</strong>
            <b>{t("cloud.initialize.newCloudProject")}</b>
            <div className="desktop-cloud-publish-node-meta">
              <span className="status">{cloudStatus}</span>
              <span><GitBranch size={15} aria-hidden="true" /><bdi>{destinationBranchName}</bdi></span>
            </div>
          </article>
        </div>

        <div className={`desktop-cloud-publish-summary ${readinessMessage ? "blocked" : ""}`} role={readinessMessage ? "alert" : undefined}>
          {readyToPush ? (
            <>
              <strong>{t(
                branchName === destinationBranchName
                  ? "cloud.initialize.pushSummary"
                  : "cloud.initialize.pushMappedSummary",
                { branch: branchName, destination: destinationBranchName, count: totalCommits },
              )}</strong>
              <p>{t(
                localChangeCountIsMinimum
                  ? "cloud.initialize.changesStayLocalAtLeast"
                  : "cloud.initialize.changesStayLocal",
                { count: localChangeCount },
              )}</p>
              {!accountEmail && <small>{t("cloud.initialize.signInNote")}</small>}
            </>
          ) : (
            <strong>{readinessMessage}</strong>
          )}
        </div>

        <div className="desktop-cloud-publish-actions">
          <button
            className="desktop-cloud-row-action desktop-cloud-publish-review"
            type="button"
            disabled={publishBusy}
            onClick={onReviewChanges}
          >
            {t("cloud.git.reviewChanges")}
          </button>
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
