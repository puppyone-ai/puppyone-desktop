import {
  AlertTriangle,
  Cloud,
  FilePenLine,
  GitBranch,
  GitCommitHorizontal,
  RefreshCw,
} from "lucide-react";
import type { Workspace } from "@puppyone/shared-ui";
import { useLocalization } from "@puppyone/localization/react";
import type { CloudPublishErrorCode, CloudPublishState } from "../../types/electron";
import {
  CloudPublishCloudMark,
  CloudPublishFolderMark,
} from "./components/CloudPublishHeroMarks";
import {
  CloudWebEmpty,
  CloudWebPage,
} from "./components/shared";
import type { CloudPublishReadiness } from "./workspace/cloudPublishReadiness";
import { formatCloudPublishFailure } from "./cloudPresentation";

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
  publishState = null,
  publishStateLoading = false,
  organizations = [],
  selectedOrganizationId = null,
  organizationStatus = "signed-out",
  organizationError = null,
  onSelectOrganization,
  onRetryOrganizations,
  onAbandonPublish,
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
  publishError?: { code: CloudPublishErrorCode; retryable: boolean } | null;
  publishState?: CloudPublishState | null;
  publishStateLoading?: boolean;
  organizations?: readonly { id: string; name: string }[];
  selectedOrganizationId?: string | null;
  organizationStatus?: "signed-out" | "loading" | "selection-required" | "ready" | "none" | "error";
  organizationError?: string | null;
  onSelectOrganization?: (organizationId: string) => void;
  onRetryOrganizations?: () => void;
  onAbandonPublish?: () => void;
  onPublishWorkspace: (organizationId?: string) => void;
}) {
  const { t } = useLocalization();
  const publishBusy = publishLoading
    || publishStateLoading
    || (publishPending && !accountEmail);
  const waitingForSignIn = publishPending && !accountEmail && !publishLoading;
  const publishing = publishLoading;
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
  const organizationReady = organizationStatus === "signed-out" || organizationStatus === "ready";
  const publishEnabled = publishState
    ? publishState.canResume
    : readyToPush && organizationReady;
  const showPublishSummary = Boolean(
    publishState
    || readinessMessage
    || organizationStatus === "selection-required"
    || organizationError,
  );
  const destinationBranchName = PUPPYONE_CLOUD_DEFAULT_BRANCH;
  const cloudStatus = publishState
    ? getCloudPublishPhaseLabel(publishState.phase, t)
    : t(waitingForSignIn
      ? "cloud.initialize.waitingForSignIn"
      : publishing
        ? "cloud.initialize.initializing"
        : "cloud.initialize.notInitialized");
  return (
    <div className="desktop-cloud-publish-container">
      {waitingForSignIn && (
        <div className="desktop-cloud-main-alert info" role="status">
          {t("cloud.state.publishSignInPending")}
        </div>
      )}
      {publishError && (
        <div className="desktop-cloud-main-alert" role="alert">
          {formatCloudPublishFailure(publishError, t)}
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
              {organizationStatus !== "signed-out" && (
                <div className="desktop-cloud-publish-organization">
                  {organizationStatus === "loading" ? (
                    <span>{t("cloud.common.loading")}</span>
                  ) : organizationStatus === "none" ? (
                    <span className="warning">{t("cloud.initialize.noOrganization")}</span>
                  ) : organizationStatus === "error" ? (
                    <button type="button" className="desktop-cloud-row-action" onClick={onRetryOrganizations}>
                      {t("cloud.common.retry")}
                    </button>
                  ) : organizations.length > 1 ? (
                    <label className="desktop-cloud-organization-selector">
                      <span>{t("cloud.organization.selectLabel")}</span>
                      <select
                        aria-label={t("cloud.organization.selectLabel")}
                        value={selectedOrganizationId ?? ""}
                        onChange={(event) => onSelectOrganization?.(event.target.value)}
                      >
                        <option value="" disabled>{t("cloud.organization.selectPlaceholder")}</option>
                        {organizations.map((organization) => (
                          <option value={organization.id} key={organization.id}>{organization.name}</option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <span>{organizations[0]?.name}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {showPublishSummary && (
          <div className={`desktop-cloud-publish-summary ${readinessMessage ? "blocked" : ""}`} role={readinessMessage ? "alert" : undefined}>
            {publishState ? (
              <>
                <strong>{getCloudPublishPhaseLabel(publishState.phase, t)}</strong>
                <p>{t("cloud.initialize.resumeDescription", { project: publishState.projectName })}</p>
              </>
            ) : readinessMessage ? (
              <strong>{readinessMessage}</strong>
            ) : (
              <>
                {organizationStatus === "selection-required" && (
                  <small>{t("cloud.initialize.organizationRequired")}</small>
                )}
                {organizationError && <small className="warning">{organizationError}</small>}
              </>
            )}
          </div>
        )}

        <div className="desktop-cloud-publish-actions">
          <button
            className="desktop-cloud-row-action primary desktop-cloud-publish-primary"
            type="button"
            aria-busy={publishBusy || undefined}
            disabled={publishBusy || !publishEnabled}
            onClick={() => onPublishWorkspace(selectedOrganizationId ?? undefined)}
          >
            {t(
              publishing
                ? "cloud.initialize.initializingAndPushing"
                : publishState
                  ? "cloud.initialize.resume"
                : waitingForSignIn
                  ? "cloud.initialize.waitingForSignIn"
                  : !accountEmail
                    ? "cloud.initialize.signInToInitialize"
                    : "cloud.initialize.initializeAndPush",
            )}
          </button>
          {publishState?.canAbandon && onAbandonPublish && (
            <button
              className="desktop-cloud-row-action desktop-cloud-publish-abandon"
              type="button"
              disabled={publishBusy}
              onClick={onAbandonPublish}
            >
              {t(publishState.phase === "compensation-pending"
                ? "cloud.initialize.retryAbandon"
                : "cloud.initialize.abandon")}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function getCloudPublishPhaseLabel(
  phase: CloudPublishState["phase"],
  t: ReturnType<typeof useLocalization>["t"],
): string {
  return t(`cloud.initialize.phase.${phase}`);
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
