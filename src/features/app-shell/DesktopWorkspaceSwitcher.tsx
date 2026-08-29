import type { RefObject } from "react";
import type { Workspace } from "@puppyone/shared-ui";
import { ArrowLeft, Check, Folder, FolderOpen, FolderPlus } from "lucide-react";
import { DesktopMenuItem } from "../../components/DesktopMenu";
import { DesktopTitlebarMenuLayer } from "./DesktopTitlebarMenuLayer";
import { bidiIsolate, useLocalization } from "@puppyone/localization";

export type DesktopWorkspaceSwitcherItem = {
  id: string;
  label: string;
  detail: string;
  title: string;
  workspace: Workspace;
};

type DesktopWorkspaceSwitcherProps = {
  open: boolean;
  refObject: RefObject<HTMLDivElement>;
  titlebarLabel: string;
  workspace: Workspace;
  items: DesktopWorkspaceSwitcherItem[];
  onAddFolder?: () => void;
  onClose: () => void;
  onOpenFolder: () => void;
  onGoHome: () => void;
  onToggle: () => void;
};

export function DesktopWorkspaceSwitcher({
  open,
  refObject,
  titlebarLabel,
  workspace,
  items,
  onAddFolder,
  onClose,
  onOpenFolder,
  onGoHome,
  onToggle,
}: DesktopWorkspaceSwitcherProps) {
  const { t } = useLocalization();
  const currentItem = items.find((item) => item.id === workspace.id) ?? {
    id: workspace.id,
    label: workspace.name,
    detail: workspace.path,
    title: `${workspace.name} - ${workspace.path}`,
    workspace,
  };
  return (
    <div className="desktop-titlebar-workspace-wrap" ref={refObject}>
      <button
        className="desktop-titlebar-workspace-button local"
        type="button"
        aria-label={t("shell.workspaceSwitcher.openMenu", {
          workspace: bidiIsolate(workspace.name),
        })}
        aria-expanded={open}
        aria-haspopup="menu"
        title={t("shell.workspaceSwitcher.projectTitle", {
          project: bidiIsolate(workspace.name),
        })}
        onClick={onToggle}
      >
        <bdi className="desktop-titlebar-workspace-name">{titlebarLabel}</bdi>
      </button>

      <DesktopTitlebarMenuLayer
        anchorRef={refObject}
        className="desktop-project-menu"
        gap={4}
        onDismiss={onClose}
        open={open}
        preferredMaxHeight={520}
      >
        <div className="desktop-project-home-group">
          <DesktopMenuItem
            className="desktop-project-add desktop-project-home"
            icon={<ArrowLeft className="po-directional-icon" size={15} strokeWidth={1.9} />}
            label={t("shell.workspaceSwitcher.home")}
            onClick={onGoHome}
          />
        </div>
        <div
          className="desktop-project-list"
          data-po-scrollbar="menu"
          data-workspace-menu-layout="project-context-v1"
        >
          <DesktopProjectCurrentRow item={currentItem} />
          <DesktopMenuItem
            className="desktop-project-add desktop-project-add-folder"
            disabled={!onAddFolder}
            icon={<FolderPlus size={15} strokeWidth={1.8} />}
            label={t("shell.workspaceSwitcher.addProject")}
            onClick={onAddFolder}
          />
        </div>
        <div className="desktop-project-actions">
          <DesktopMenuItem
            className="desktop-project-add desktop-project-open-folder"
            icon={<FolderOpen size={15} strokeWidth={1.8} />}
            label={t("shell.workspaceSwitcher.openFolderInNewWindow")}
            onClick={onOpenFolder}
          />
        </div>
      </DesktopTitlebarMenuLayer>
    </div>
  );
}

function DesktopProjectCurrentRow({
  item,
}: {
  item: DesktopWorkspaceSwitcherItem;
}) {
  return (
    <div className="desktop-project-option-row selected">
      <div
        className="desktop-menu-item desktop-project-option selected"
        role="menuitem"
        aria-current="true"
        aria-disabled="true"
        title={item.title}
      >
        <span className="desktop-menu-item-icon">
          <ProjectTypeMark className="desktop-project-mark" />
        </span>
        <span className="desktop-menu-item-body">
          <bdi className="desktop-menu-item-label">{item.label}</bdi>
          {item.detail && (
            <bdi
              className="desktop-menu-item-detail"
              dir="ltr"
              title={item.workspace.path}
            >
              {item.detail}
            </bdi>
          )}
        </span>
      </div>
      <span className="desktop-project-current-indicator" aria-hidden="true">
        <Check size={14} strokeWidth={2.2} />
      </span>
    </div>
  );
}

function ProjectTypeMark({
  className,
}: {
  className: string;
}) {
  return (
    <span className={`${className} local`} aria-hidden="true">
      <Folder size={15} strokeWidth={1.8} />
    </span>
  );
}
