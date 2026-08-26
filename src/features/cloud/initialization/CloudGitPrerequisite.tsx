import { CloudUpload, RefreshCw } from "lucide-react";
import { useLocalization } from "@puppyone/localization/react";
import type {
  CloudPublishErrorCode,
  CloudPublishProgressStage,
} from "../../../types/electron";
import { formatCloudPublishFailure } from "../cloudPresentation";
import type { CloudPublishReadiness } from "../workspace/cloudPublishReadiness";
import { getCloudPublishProgressLabel } from "./CloudPublishProgressIndicator";

export function CloudGitPrerequisite({
  workspaceName,
  readiness,
  publishBusy,
  publishEnabled,
  publishError,
  progressStage,
  organizations,
  selectedOrganizationId,
  organizationStatus,
  organizationError,
  onSelectOrganization,
  onRetryOrganizations,
  onOpenSourceControl,
  onPublishWorkspace,
}: {
  workspaceName: string;
  readiness: Exclude<CloudPublishReadiness, "ready">;
  publishBusy: boolean;
  publishEnabled: boolean;
  publishError: { code: CloudPublishErrorCode; retryable: boolean } | null;
  progressStage: CloudPublishProgressStage | null;
  organizations: readonly { id: string; name: string }[];
  selectedOrganizationId: string | null;
  organizationStatus: "signed-out" | "loading" | "selection-required" | "ready" | "none" | "error";
  organizationError: string | null;
  onSelectOrganization?: (organizationId: string) => void;
  onRetryOrganizations?: () => void;
  onOpenSourceControl?: () => void;
  onPublishWorkspace: (organizationId?: string) => void;
}) {
  const { t } = useLocalization();

  return (
    <div className="desktop-cloud-publish-container">
      <section
        className="desktop-cloud-git-prerequisite"
        data-readiness={readiness}
        aria-labelledby="desktop-cloud-git-prerequisite-title"
      >
        <div className="desktop-cloud-git-prerequisite-mark" aria-hidden="true">
          <CloudUpload size={40} strokeWidth={1.35} />
        </div>
        <header className="desktop-cloud-git-prerequisite-header">
          <h1 id="desktop-cloud-git-prerequisite-title">
            {t("cloud.initialize.publishFolderTitle", { folder: workspaceName })}
          </h1>
          <p>{t("cloud.initialize.publishFolderDescription")}</p>
        </header>

        {publishError && (
          <div className="desktop-cloud-git-prerequisite-error" role="alert">
            {formatCloudPublishFailure(publishError, t)}
          </div>
        )}

        {organizationStatus !== "signed-out" && (
          <div className="desktop-cloud-git-prerequisite-organization">
            {organizationStatus === "loading" ? (
              <span>{t("cloud.common.loading")}</span>
            ) : organizationStatus === "none" ? (
              <span>{t("cloud.initialize.noOrganization")}</span>
            ) : organizationStatus === "error" ? (
              <>
                <span>{organizationError ?? t("cloud.message.organization-load-failed")}</span>
                {onRetryOrganizations && (
                  <button type="button" onClick={onRetryOrganizations}>
                    {t("cloud.common.retry")}
                  </button>
                )}
              </>
            ) : organizations.length > 1 ? (
              <label>
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
            ) : organizations[0] ? (
              <span>{organizations[0].name}</span>
            ) : null}
          </div>
        )}

        <div className="desktop-cloud-publish-actions desktop-cloud-git-prerequisite-actions">
          <button
            className="desktop-cloud-row-action primary desktop-cloud-publish-primary"
            type="button"
            aria-busy={publishBusy || undefined}
            disabled={publishBusy || !publishEnabled}
            onClick={() => onPublishWorkspace(selectedOrganizationId ?? undefined)}
          >
            {publishBusy && <RefreshCw size={14} className="spin" aria-hidden="true" />}
            <span>
              {progressStage
                ? getCloudPublishProgressLabel(progressStage, t)
                : t("cloud.initialize.enableGitAndPublish")}
            </span>
          </button>
          {onOpenSourceControl && !publishBusy && (
            <button
              className="desktop-cloud-git-prerequisite-review"
              type="button"
              onClick={onOpenSourceControl}
            >
              {t("cloud.initialize.reviewFilesBeforePublishing")}
            </button>
          )}
          <small>{t("cloud.initialize.gitIgnoreNote")}</small>
        </div>
      </section>
    </div>
  );
}
