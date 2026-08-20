import { SquareTerminal } from "lucide-react";
import { useLocalization } from "@puppyone/localization/react";
import {
  DesktopDialogCloseButton,
  DesktopDialogRoot,
  DesktopDialogSurface,
} from "../../../components/DesktopDialog";
import { DesktopOverlayLayer } from "../../app-shell/DesktopOverlayPortal";

type TerminalCloseConfirmationDialogProps = {
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function TerminalCloseConfirmationDialog({
  title,
  onCancel,
  onConfirm,
}: TerminalCloseConfirmationDialogProps) {
  const { t } = useLocalization();
  const dialogTitle = t("terminal.closeDialog.title", { title });

  return (
    <DesktopOverlayLayer>
      <DesktopDialogRoot onClose={onCancel}>
        <DesktopDialogSurface
          width={420}
          className="desktop-terminal-close-dialog"
          ariaLabel={dialogTitle}
        >
          <header className="desktop-dialog-header">
            <div className="desktop-dialog-title-row">
              <span
                className="desktop-dialog-leading destructive"
                aria-hidden="true"
              >
                <SquareTerminal size={17} strokeWidth={1.8} />
              </span>
              <div>
                <h2>{dialogTitle}</h2>
              </div>
            </div>
            <DesktopDialogCloseButton
              title={t("common.action.close")}
              onClick={onCancel}
            />
          </header>

          <div className="desktop-dialog-body" data-po-scrollbar="content">
            <p className="desktop-terminal-close-dialog-detail">
              {t("terminal.closeDialog.detail")}
            </p>
          </div>

          <footer className="desktop-dialog-footer">
            <button
              className="desktop-dialog-button"
              type="button"
              data-desktop-dialog-initial-focus="true"
              onClick={onCancel}
            >
              {t("common.action.cancel")}
            </button>
            <button
              className="desktop-dialog-button primary destructive"
              type="button"
              onClick={onConfirm}
            >
              {t("terminal.closeDialog.confirm")}
            </button>
          </footer>
        </DesktopDialogSurface>
      </DesktopDialogRoot>
    </DesktopOverlayLayer>
  );
}
