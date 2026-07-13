import { ArrowRightLeft, Cloud, Folder, FolderOpen } from "lucide-react";
import { useLocalization } from "@puppyone/localization";
import type { DesktopWorkspaceSurfaceAction } from "./types";

export function DesktopWorkspaceSurfaceActionButton({
  action,
  buttonClassName = "desktop-sidebar-footer-button",
}: {
  action: DesktopWorkspaceSurfaceAction;
  buttonClassName?: string;
}) {
  const { t } = useLocalization();
  const config = getActionConfig(action.kind);
  return (
    <button
      className={buttonClassName}
      type="button"
      title={t(config.titleId)}
      aria-label={t(config.titleId)}
      disabled={action.disabled}
      onClick={action.onClick}
    >
      <span className="desktop-sidebar-surface-switch-icon" aria-hidden="true">
        <ArrowRightLeft size={13} strokeWidth={2} />
        <config.icon size={11} strokeWidth={2} />
      </span>
    </button>
  );
}

function getActionConfig(kind: DesktopWorkspaceSurfaceAction["kind"]) {
  if (kind === "switch-to-cloud") {
    return { titleId: "shell.surface.switchToCloud", icon: Cloud };
  }
  if (kind === "switch-to-local") {
    return { titleId: "shell.surface.switchToLocal", icon: Folder };
  }
  return { titleId: "shell.surface.openLocally", icon: FolderOpen };
}
