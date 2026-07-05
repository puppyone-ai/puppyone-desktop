import { Cloud, LoaderCircle } from "lucide-react";
import {
  DesktopDialogCloseButton,
  DesktopDialogRoot,
  DesktopDialogSurface,
} from "../../../components/DesktopDialog";
import { CLOUD_PROJECT_MAPPING_ERROR } from "./cloudProjectResolution";

export function CloudProjectResolveDialog({
  error,
  resolving,
  onClose,
}: {
  error: string | null;
  resolving: boolean;
  onClose: () => void;
}) {
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
              <h2>{resolving ? "Resolving Cloud project" : "Cloud project not found"}</h2>
              <p>
                {resolving
                  ? "Matching this local workspace to its Puppyone Cloud project."
                  : "Desktop could not match this workspace to a Cloud project root scope."}
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
              <span>Resolving...</span>
            </div>
          ) : (
            <div className="desktop-dialog-error desktop-cloud-resolve-error">
              {error || CLOUD_PROJECT_MAPPING_ERROR}
            </div>
          )}
        </div>
        {!resolving && (
          <footer className="desktop-dialog-footer">
            <button className="desktop-dialog-button primary" type="button" onClick={onClose}>
              Close
            </button>
          </footer>
        )}
      </DesktopDialogSurface>
    </DesktopDialogRoot>
  );
}
