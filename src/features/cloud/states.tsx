import {
  ArrowDown,
  ArrowRight,
  Cloud,
  FilePenLine,
  Folder,
  GitBranch,
  GitCommitHorizontal,
} from "lucide-react";
import type { Workspace } from "@puppyone/shared-ui";
import { useLocalization } from "@puppyone/localization/react";
import {
  CloudWebEmpty,
  CloudWebPage,
} from "./components/shared";

const PUPPYONE_CLOUD_DEFAULT_BRANCH = "main";

export { CloudProjectRecoveryState } from "./states/CloudProjectRecoveryState";

export function CloudLocalOnlyWorkspace({
  workspace,
  accountEmail,
  branchName,
  totalCommits,
  localChangeCount,
  isGitRepository,
  hasHeadCommit,
  hasCurrentBranch,
  publishLoading,
  publishPending = false,
  publishError = null,
  onReviewChanges,
  onPublishWorkspace,
}: {
  workspace: Workspace;
  accountEmail: string | null;
  branchName: string;
  totalCommits: number;
  localChangeCount: number;
  isGitRepository: boolean;
  hasHeadCommit: boolean;
  hasCurrentBranch: boolean;
  publishLoading: boolean;
  publishPending?: boolean;
  publishError?: string | null;
  onReviewChanges: () => void;
  onPublishWorkspace: () => void;
}) {
  const { t } = useLocalization();
  const publishBusy = publishLoading || publishPending;
  const waitingForSignIn = publishPending && !accountEmail && !publishLoading;
  const publishing = publishLoading || (publishPending && Boolean(accountEmail));
  const readinessMessage = !isGitRepository
    ? t("cloud.initialize.repositoryRequired")
    : !hasHeadCommit
      ? t("cloud.initialize.commitRequired")
      : !hasCurrentBranch
        ? t("cloud.initialize.branchRequired")
        : null;
  const readyToPush = readinessMessage === null;
  const destinationBranchName = PUPPYONE_CLOUD_DEFAULT_BRANCH;
  const cloudStatus = t(
    waitingForSignIn
      ? "cloud.initialize.waitingForSignIn"
      : publishing
        ? "cloud.initialize.initializing"
        : "cloud.initialize.notInitialized",
  );
  return (
    <>
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
                {t("cloud.initialize.localChangeCount", { count: localChangeCount })}
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
              <p>{t("cloud.initialize.changesStayLocal", { count: localChangeCount })}</p>
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
                  : "cloud.initialize.initializeAndPush",
            )}
          </button>
        </div>
      </section>
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
