import { Cloud, LoaderCircle, RefreshCw } from "lucide-react";
import { useLocalization } from "@puppyone/localization/react";
import type { DesktopCloudSession } from "../../../lib/cloudApi";
import {
  DesktopDialogCloseButton,
  DesktopDialogRoot,
  DesktopDialogSurface,
} from "../../../components/DesktopDialog";
import { formatCloudMessage } from "../cloudPresentation";
import {
  CloudOrganizationSelector,
  useCloudOrganizationData,
} from "./CloudGlobalPages";

/** Explicit owner selection shared by every plain (non-Publish) Project create. */
export function CloudProjectCreateDialog({
  session,
  apiBaseUrl,
  submitting,
  submitError,
  onSessionChange,
  onCancel,
  onSubmit,
}: {
  session: DesktopCloudSession;
  apiBaseUrl: string | null;
  submitting: boolean;
  submitError: string | null;
  onSessionChange: (session: DesktopCloudSession | null) => void;
  onCancel: () => void;
  onSubmit: (organizationId: string) => void;
}) {
  const { t } = useLocalization();
  const organizations = useCloudOrganizationData(
    session,
    apiBaseUrl,
    onSessionChange,
    { loadTeamDetails: false, selectionPolicy: "explicit" },
  );
  const canSubmit = organizations.status === "ready"
    && Boolean(organizations.selectedOrganizationId)
    && !submitting;

  return (
    <DesktopDialogRoot
      dismissOnBackdrop={!submitting}
      onClose={submitting ? undefined : onCancel}
    >
      <DesktopDialogSurface width={440} ariaLabel={t("onboarding.action.createCloudProject")}>
        <header className="desktop-dialog-header">
          <div className="desktop-dialog-title-row">
            <span className="desktop-dialog-leading cloud" aria-hidden="true">
              {submitting
                ? <LoaderCircle size={16} className="desktop-dialog-spinner" />
                : <Cloud size={16} />}
            </span>
            <div>
              <h2>{t("onboarding.action.createCloudProject")}</h2>
              <p>{t("cloud.initialize.organizationRequired")}</p>
            </div>
          </div>
          {!submitting && <DesktopDialogCloseButton onClick={onCancel} />}
        </header>

        <div className="desktop-dialog-body">
          {organizations.loading && organizations.organizations.length === 0 ? (
            <div className="desktop-dialog-callout" role="status">
              <LoaderCircle size={14} className="desktop-dialog-spinner" />
              <span>{t("cloud.common.loading")}</span>
            </div>
          ) : organizations.status === "none" ? (
            <div className="desktop-dialog-error">{t("cloud.initialize.noOrganization")}</div>
          ) : organizations.status === "error" ? (
            <div className="desktop-dialog-error">
              <span>{organizations.error ? formatCloudMessage(organizations.error, t) : t("cloud.team.loadFailed")}</span>
              <button className="desktop-dialog-button" type="button" onClick={organizations.refresh}>
                <RefreshCw size={13} />
                {t("cloud.common.retry")}
              </button>
            </div>
          ) : (
            <div className="desktop-dialog-callout">
              {organizations.organizations.length === 1 ? (
                <>
                  <strong>{t("cloud.organization.selectLabel")}</strong>
                  <span>{organizations.organization?.name}</span>
                </>
              ) : (
                <CloudOrganizationSelector organizationData={organizations} />
              )}
            </div>
          )}
          {submitError && <div className="desktop-dialog-error" role="alert">{submitError}</div>}
        </div>

        <footer className="desktop-dialog-footer two-action">
          <button className="desktop-dialog-button" type="button" disabled={submitting} onClick={onCancel}>
            {t("cloud.common.cancel")}
          </button>
          <button
            className="desktop-dialog-button primary"
            type="button"
            disabled={!canSubmit}
            onClick={() => {
              if (organizations.selectedOrganizationId) onSubmit(organizations.selectedOrganizationId);
            }}
          >
            {submitting ? t("cloud.common.loading") : t("onboarding.action.createCloudProject")}
          </button>
        </footer>
      </DesktopDialogSurface>
    </DesktopDialogRoot>
  );
}
