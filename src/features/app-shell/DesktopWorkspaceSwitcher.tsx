import type { RefObject } from "react";
import type { Workspace } from "@puppyone/shared-ui";
import { ArrowLeft, Cloud, Folder, FolderOpen } from "lucide-react";
import { DesktopMenuItem, DesktopMenuSection, DesktopMenuSurface } from "../../components/DesktopMenu";

export type DesktopWorkspaceSwitcherItem = {
  id: string;
  kind: "local" | "cloud";
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
  workspaceKind: DesktopWorkspaceSwitcherItem["kind"];
  items: DesktopWorkspaceSwitcherItem[];
  onOpenFolder: () => void;
  onCreateCloudProject?: () => void | Promise<void>;
  onOpenItem: (item: DesktopWorkspaceSwitcherItem) => void;
  onGoHome: () => void;
  onToggle: () => void;
};

export function DesktopWorkspaceSwitcher({
  open,
  refObject,
  titlebarLabel,
  workspace,
  workspaceKind,
  items,
  onOpenFolder,
  onCreateCloudProject,
  onOpenItem,
  onGoHome,
  onToggle,
}: DesktopWorkspaceSwitcherProps) {
  const cloudItems = items.filter((item) => item.kind === "cloud");
  const localItems = items.filter((item) => item.kind === "local");

  const renderProjectRows = (items: DesktopWorkspaceSwitcherItem[]) => items.map((item) => (
    <DesktopMenuItem
      key={item.id}
      className="desktop-project-option"
      title={item.title}
      selected={item.id === workspace.id}
      icon={<ProjectTypeMark kind={item.kind} className="desktop-project-mark" />}
      label={item.label}
      detail={item.detail}
      onClick={() => onOpenItem(item)}
    />
  ));

  return (
    <div className="desktop-titlebar-workspace-wrap" ref={refObject}>
      <button
        className="desktop-titlebar-workspace-button"
        type="button"
        aria-label={`Switch workspace: ${workspace.name}`}
        aria-expanded={open}
        title={workspace.name}
        onClick={onToggle}
      >
        <ProjectTypeMark kind={workspaceKind} className="desktop-titlebar-workspace-mark" />
        <span className="desktop-titlebar-workspace-name">{titlebarLabel}</span>
      </button>

      {open && (
        <DesktopMenuSurface className="desktop-project-menu desktop-titlebar-menu">
          <DesktopMenuItem
            className="desktop-project-add desktop-project-home"
            icon={<ArrowLeft size={14} />}
            label="To homepage"
            onClick={onGoHome}
          />
          <div className="desktop-project-list">
            {cloudItems.length > 0 && (
              <DesktopMenuSection className="desktop-project-section" aria-label="Cloud projects">
                {renderProjectRows(cloudItems)}
              </DesktopMenuSection>
            )}
            {localItems.length > 0 && (
              <DesktopMenuSection className="desktop-project-section" aria-label="Local projects">
                {renderProjectRows(localItems)}
              </DesktopMenuSection>
            )}
          </div>
          <div className="desktop-project-actions">
            <DesktopMenuItem
              className="desktop-project-add"
              icon={<FolderOpen size={14} />}
              label="Open local folder"
              onClick={onOpenFolder}
            />
            {onCreateCloudProject && (
              <DesktopMenuItem
                className="desktop-project-add"
                icon={<Cloud size={14} />}
                label="Create cloud project"
                onClick={() => void onCreateCloudProject()}
              />
            )}
          </div>
        </DesktopMenuSurface>
      )}
    </div>
  );
}

function ProjectTypeMark({
  kind,
  className,
}: {
  kind: DesktopWorkspaceSwitcherItem["kind"];
  className: string;
}) {
  if (kind === "cloud") {
    return (
      <span className={`${className} linked`} aria-hidden="true">
        <Cloud size={15} strokeWidth={1.8} />
      </span>
    );
  }

  return (
    <span className={`${className} local`} aria-hidden="true">
      <Folder size={15} strokeWidth={1.8} />
    </span>
  );
}
