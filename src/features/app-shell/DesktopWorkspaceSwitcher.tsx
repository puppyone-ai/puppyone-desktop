import { useEffect, useMemo, useState, type RefObject } from "react";
import {
  createWorkspaceFolder,
  type Workspace,
  type WorkspaceFolder,
} from "@puppyone/shared-ui";
import { ArrowLeft, Check, Folder, FolderPlus } from "lucide-react";
import { DesktopMenuItem } from "../../components/DesktopMenu";
import { DesktopTitlebarMenuLayer } from "./DesktopTitlebarMenuLayer";
import { bidiIsolate, useLocalization } from "@puppyone/localization";
import { getWorkspaceParentPathForDisplay } from "./workspaceHomeModel";

type DesktopWorkspaceSwitcherProps = {
  open: boolean;
  refObject: RefObject<HTMLDivElement>;
  titlebarLabel: string;
  workspace: Workspace;
  workspaceFolders: readonly WorkspaceFolder[];
  availableProjects?: readonly Workspace[];
  onAddExistingProject?: (folderPath: string) => void;
  onOpenFolder?: () => void;
  onClose: () => void;
  onGoHome: () => void;
  onToggle: () => void;
};

export function DesktopWorkspaceSwitcher({
  open,
  refObject,
  titlebarLabel,
  workspace,
  workspaceFolders,
  availableProjects = [],
  onAddExistingProject,
  onOpenFolder,
  onClose,
  onGoHome,
  onToggle,
}: DesktopWorkspaceSwitcherProps) {
  const { t } = useLocalization();
  const [view, setView] = useState<"projects" | "add">("projects");
  const attachedFolders = useMemo(
    () => workspaceFolders.length > 0
      ? workspaceFolders
      : [createWorkspaceFolder(workspace)],
    [workspace, workspaceFolders],
  );
  const unattachedProjects = useMemo(() => {
    const attachedPaths = new Set(attachedFolders.map((folder) => folder.workspace.path));
    return availableProjects.filter((project) => !attachedPaths.has(project.path));
  }, [attachedFolders, availableProjects]);
  useEffect(() => {
    if (!open) setView("projects");
  }, [open]);
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
        {view === "projects" ? (
          <>
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
              data-workspace-menu-layout="workspace-composition-v1"
            >
              {attachedFolders.map((folder, index) => (
                <DesktopProjectRow
                  key={folder.id}
                  folder={folder}
                  primary={index === 0}
                />
              ))}
              <DesktopMenuItem
                className="desktop-project-add desktop-project-add-folder"
                disabled={!onAddExistingProject && !onOpenFolder}
                icon={<FolderPlus size={15} strokeWidth={1.8} />}
                label={t("shell.workspaceSwitcher.addProject")}
                onClick={() => setView("add")}
              />
            </div>
          </>
        ) : (
          <>
            <div className="desktop-project-home-group">
              <DesktopMenuItem
                className="desktop-project-add desktop-project-home"
                icon={<ArrowLeft className="po-directional-icon" size={15} strokeWidth={1.9} />}
                label={t("shell.workspaceSwitcher.projects")}
                onClick={() => setView("projects")}
              />
            </div>
            <div className="desktop-project-list" data-po-scrollbar="menu">
              {unattachedProjects.map((project) => (
                <DesktopMenuItem
                  className="desktop-project-add"
                  detail={getWorkspaceParentPathForDisplay(project.path)}
                  icon={<ProjectTypeMark className="desktop-project-mark" />}
                  key={project.id}
                  label={<bdi>{project.name}</bdi>}
                  onClick={() => onAddExistingProject?.(project.path)}
                  title={`${project.name} - ${project.path}`}
                />
              ))}
              <DesktopMenuItem
                className="desktop-project-add desktop-project-add-folder"
                disabled={!onOpenFolder}
                icon={<FolderPlus size={15} strokeWidth={1.8} />}
                label={t("shell.workspaceSwitcher.openFolder")}
                onClick={onOpenFolder}
              />
            </div>
          </>
        )}
      </DesktopTitlebarMenuLayer>
    </div>
  );
}

function DesktopProjectRow({
  folder,
  primary,
}: {
  folder: WorkspaceFolder;
  primary: boolean;
}) {
  const detail = getWorkspaceParentPathForDisplay(folder.workspace.path);
  return (
    <div className={`desktop-project-option-row${primary ? " selected" : ""}`}>
      <div
        className={`desktop-menu-item desktop-project-option${primary ? " selected" : ""}`}
        role="menuitem"
        aria-current={primary ? "true" : undefined}
        aria-disabled="true"
        title={`${folder.name} - ${folder.workspace.path}`}
      >
        <span className="desktop-menu-item-icon">
          <ProjectTypeMark className="desktop-project-mark" />
        </span>
        <span className="desktop-menu-item-body">
          <bdi className="desktop-menu-item-label">{folder.name}</bdi>
          {detail && (
            <bdi
              className="desktop-menu-item-detail"
              dir="ltr"
              title={folder.workspace.path}
            >
              {detail}
            </bdi>
          )}
        </span>
      </div>
      {primary && (
        <span className="desktop-project-current-indicator" aria-hidden="true">
          <Check size={14} strokeWidth={2.2} />
        </span>
      )}
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
