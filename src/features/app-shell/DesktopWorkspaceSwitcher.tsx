import type { RefObject } from "react";
import type { Workspace } from "@puppyone/shared-ui";
import { ArrowLeft, ChevronDown, Cloud, Folder, FolderOpen } from "lucide-react";

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
    <div
      key={item.id}
      className={`desktop-project-option-row ${item.id === workspace.id ? "active" : ""}`}
    >
      <button
        className={`desktop-project-option ${item.id === workspace.id ? "active" : ""}`}
        type="button"
        title={item.title}
        onClick={() => onOpenItem(item)}
      >
        <ProjectTypeMark kind={item.kind} className="desktop-project-mark" />
        <span className="desktop-project-option-text">
          <strong>{item.label}</strong>
          <small>{item.detail}</small>
        </span>
      </button>
    </div>
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
        <ChevronDown size={12} />
      </button>

      {open && (
        <div className="desktop-project-menu desktop-titlebar-menu">
          <button className="desktop-project-add desktop-project-home" type="button" onClick={onGoHome}>
            <span className="desktop-project-add-mark" aria-hidden="true">
              <ArrowLeft size={14} />
            </span>
            <span>To homepage</span>
          </button>
          <div className="desktop-project-list">
            {cloudItems.length > 0 && (
              <section className="desktop-project-section" aria-label="Cloud projects">
                {renderProjectRows(cloudItems)}
              </section>
            )}
            {localItems.length > 0 && (
              <section className="desktop-project-section" aria-label="Local projects">
                {renderProjectRows(localItems)}
              </section>
            )}
          </div>
          <div className="desktop-project-actions">
            <button className="desktop-project-add" type="button" onClick={onOpenFolder}>
              <span className="desktop-project-add-mark" aria-hidden="true">
                <FolderOpen size={14} />
              </span>
              <span>Open local folder</span>
            </button>
            {onCreateCloudProject && (
              <button
                className="desktop-project-add"
                type="button"
                onClick={() => void onCreateCloudProject()}
              >
                <span className="desktop-project-add-mark" aria-hidden="true">
                  <Cloud size={14} />
                </span>
                <span>Create cloud project</span>
              </button>
            )}
          </div>
        </div>
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
