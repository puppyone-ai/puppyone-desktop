import { Eye, Hand, ShieldCheck } from "lucide-react";
import { useLocalization } from "@puppyone/localization";
import {
  DesktopDialogCloseButton,
  DesktopDialogRoot,
  DesktopDialogSurface,
} from "../../../components/DesktopDialog";
import "./agent-file-activity-permission.css";

export function AgentFileActivityPermissionDialog({
  authorizing,
  error,
  onCancel,
  onAuthorize,
}: {
  authorizing: boolean;
  error: boolean;
  onCancel: () => void;
  onAuthorize: () => void;
}) {
  const { t } = useLocalization();
  const title = t("settings.appearance.agentFileActivity.permission.title");

  return (
    <DesktopDialogRoot
      onClose={authorizing ? undefined : onCancel}
      dismissOnBackdrop={!authorizing}
    >
      <DesktopDialogSurface
        width={430}
        className="desktop-agent-activity-permission-dialog"
        ariaLabel={title}
      >
        <header className="desktop-dialog-header">
          <div className="desktop-dialog-title-row">
            <span className="desktop-dialog-leading desktop-agent-activity-permission-leading" aria-hidden="true">
              <ShieldCheck size={17} strokeWidth={1.8} />
            </span>
            <div>
              <h2>{title}</h2>
              <p>{t("settings.appearance.agentFileActivity.permission.detail")}</p>
            </div>
          </div>
          <DesktopDialogCloseButton
            title={t("common.action.close")}
            disabled={authorizing}
            onClick={onCancel}
          />
        </header>

        <div className="desktop-dialog-body desktop-agent-activity-permission-body" data-po-scrollbar="content">
          <div className="desktop-agent-activity-permission-preview" aria-hidden="true">
            <span data-kind="read"><Eye size={15} strokeWidth={1.8} /></span>
            <i />
            <span data-kind="write"><Hand size={15} strokeWidth={1.8} /></span>
          </div>
          <div className="desktop-agent-activity-permission-access">
            <strong>{t("settings.appearance.agentFileActivity.permission.accessTitle")}</strong>
            <span>{t("settings.appearance.agentFileActivity.permission.accessDetail")}</span>
          </div>
          <p className="desktop-dialog-note desktop-agent-activity-permission-note">
            {t("settings.appearance.agentFileActivity.permission.localOnly")}
          </p>
          {error && (
            <p className="desktop-dialog-error" role="alert">
              {t("settings.appearance.agentFileActivity.permission.error")}
            </p>
          )}
        </div>

        <footer className="desktop-dialog-footer">
          <button
            className="desktop-dialog-button"
            type="button"
            data-desktop-dialog-initial-focus="true"
            disabled={authorizing}
            onClick={onCancel}
          >
            {t("common.action.cancel")}
          </button>
          <button
            className="desktop-dialog-button primary"
            type="button"
            disabled={authorizing}
            onClick={onAuthorize}
          >
            {t(authorizing
              ? "settings.appearance.agentFileActivity.permission.enabling"
              : "settings.appearance.agentFileActivity.permission.enable")}
          </button>
        </footer>
      </DesktopDialogSurface>
    </DesktopDialogRoot>
  );
}
