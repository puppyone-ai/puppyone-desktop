import { Cloud, LoaderCircle } from "lucide-react";
import { useLocalization } from "@puppyone/localization/react";
import {
  DesktopDialogCloseButton,
  DesktopDialogRoot,
  DesktopDialogSurface,
} from "../../../components/DesktopDialog";

export function CloudProjectResolveDialog({
  error,
  resolving,
  onClose,
}: {
  error: string | null;
  resolving: boolean;
  onClose: () => void;
}) {
  const { t } = useLocalization();
  const canClose = !resolving;
  return (
    <DesktopDialogRoot
      dismissOnBackdrop={canClose}
      onClose={canClose ? onClose : undefined}
    >
      <DesktopDialogSurface width={420} className="desktop-cloud-resolve-dialog">
        <header className="desktop-dialog-header">
          <div className="desktop-dialog-title-row">
            <span className="desktop-dialog-leading cloud" aria-hidden="true">
              {resolving ? (
                <LoaderCircle size={16} strokeWidth={2} className="desktop-dialog-spinner" />
              ) : (
                <Cloud size={16} strokeWidth={2} />
              )}
            </span>
            <div>
              <h2>{t(resolving ? "cloud.resolve.resolvingTitle" : "cloud.resolve.notFoundTitle")}</h2>
              <p>
                {resolving
                  ? t("cloud.resolve.matchingDescription")
                  : t("cloud.resolve.notFoundDescription")}
              </p>
            </div>
          </div>
          {canClose && <DesktopDialogCloseButton onClick={onClose} />}
        </header>
        <div className="desktop-dialog-body">
          {resolving ? (
            <div className="desktop-dialog-callout desktop-cloud-resolve-status">
              <strong>
                <LoaderCircle size={14} strokeWidth={2} className="desktop-dialog-spinner" />
              </strong>
              <span>{t("cloud.common.resolving")}</span>
            </div>
          ) : (
            <div className="desktop-dialog-error desktop-cloud-resolve-error">
              {error || t("cloud.resolve.mappingError")}
            </div>
          )}
        </div>
        {!resolving && (
          <footer className="desktop-dialog-footer">
            <button className="desktop-dialog-button primary" type="button" onClick={onClose}>
              {t("cloud.common.close")}
            </button>
          </footer>
        )}
      </DesktopDialogSurface>
    </DesktopDialogRoot>
  );
}
