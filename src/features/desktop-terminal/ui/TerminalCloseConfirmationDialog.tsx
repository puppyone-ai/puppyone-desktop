import { SquareTerminal } from "lucide-react";
import { useLocalization } from "@puppyone/localization/react";
import {
  DesktopDialogCloseButton,
  DesktopDialogRoot,
  DesktopDialogSurface,
} from "../../../components/DesktopDialog";

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
    <DesktopDialogRoot onClose={onCancel}>
      <DesktopDialogSurface
        width={420}
        className="desktop-terminal-close-dialog"
        ariaLabel={dialogTitle}
      >
        <header className="desktop-dialog-header">
          <div className="desktop-dialog-title-row">
            <span
              className="desktop-dialog-leading desktop-terminal-close-dialog-leading"
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

        <div className="desktop-dialog-body">
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
            className="desktop-dialog-button desktop-terminal-close-dialog-confirm"
            type="button"
            onClick={onConfirm}
          >
            {t("terminal.closeDialog.confirm")}
          </button>
        </footer>
      </DesktopDialogSurface>
    </DesktopDialogRoot>
  );
}
