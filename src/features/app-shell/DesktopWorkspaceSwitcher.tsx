import { useEffect, useRef, useState, type MouseEvent, type RefObject } from "react";
import type { Workspace } from "@puppyone/shared-ui";
import { ArrowLeft, Check, Cloud, Copy, Folder, FolderOpen } from "lucide-react";
import { DesktopMenuItem, DesktopMenuSection, DesktopMenuSurface } from "../../components/DesktopMenu";
import { writeClipboardText } from "../settings/utils";
import { bidiIsolate, useLocalization } from "@puppyone/localization";

export type DesktopWorkspaceSwitcherItem = {
  id: string;
  kind: "local" | "cloud";
  label: string;
  detail: string;
  title: string;
  workspace: Workspace;
};

type DesktopWorkspaceSwitcherProps = {
  compact: boolean;
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
  compact,
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
  const { t } = useLocalization();
  const cloudItems = items.filter((item) => item.kind === "cloud");
  const localItems = items.filter((item) => item.kind === "local");

  const renderProjectRows = (projectItems: DesktopWorkspaceSwitcherItem[]) => projectItems.map((item) => (
    <DesktopProjectMenuRow
      key={item.id}
      item={item}
      selected={item.id === workspace.id}
      onOpen={() => onOpenItem(item)}
    />
  ));

  return (
    <div className="desktop-titlebar-workspace-wrap" ref={refObject}>
      <button
        className={`desktop-titlebar-workspace-button ${workspaceKind}`}
        type="button"
        aria-label={t("shell.workspaceSwitcher.switch", {
          kind: t(workspaceKind === "cloud" ? "shell.workspaceSwitcher.kind.cloud" : "shell.workspaceSwitcher.kind.local"),
          workspace: bidiIsolate(workspace.name),
        })}
        aria-expanded={open}
        aria-haspopup="menu"
        title={t("shell.workspaceSwitcher.projectTitle", {
          project: bidiIsolate(workspace.name),
        })}
        onClick={onToggle}
      >
        {compact && (
          <ProjectTypeMark kind={workspaceKind} className="desktop-titlebar-workspace-mark" />
        )}
        <bdi className="desktop-titlebar-workspace-name">{titlebarLabel}</bdi>
      </button>

      {open && (
        <DesktopMenuSurface className="desktop-project-menu desktop-titlebar-menu">
          <DesktopMenuItem
            className="desktop-project-add desktop-project-home"
            icon={<ArrowLeft className="po-directional-icon" size={14} />}
            label={t("shell.workspaceSwitcher.home")}
            onClick={onGoHome}
          />
          <div className="desktop-project-list">
            {cloudItems.length > 0 && (
              <DesktopMenuSection className="desktop-project-section" aria-label={t("shell.workspaceSwitcher.cloudProjects")}>
                {renderProjectRows(cloudItems)}
              </DesktopMenuSection>
            )}
            {localItems.length > 0 && (
              <DesktopMenuSection className="desktop-project-section" aria-label={t("shell.workspaceSwitcher.localProjects")}>
                {renderProjectRows(localItems)}
              </DesktopMenuSection>
            )}
          </div>
          <div className="desktop-project-actions">
            <DesktopMenuItem
              className="desktop-project-add"
              icon={<FolderOpen size={14} />}
              label={t("shell.workspaceSwitcher.openLocalFolder")}
              onClick={onOpenFolder}
            />
            {onCreateCloudProject && (
              <DesktopMenuItem
                className="desktop-project-add"
                icon={<Cloud size={14} />}
                label={t("shell.workspaceSwitcher.createCloudProject")}
                onClick={() => void onCreateCloudProject()}
              />
            )}
          </div>
        </DesktopMenuSurface>
      )}
    </div>
  );
}

function DesktopProjectMenuRow({
  item,
  selected,
  onOpen,
}: {
  item: DesktopWorkspaceSwitcherItem;
  selected: boolean;
  onOpen: () => void;
}) {
  const { t } = useLocalization();
  const path = getProjectCopyPath(item);
  const [copied, setCopied] = useState(false);
  const copiedResetRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (copiedResetRef.current !== null) window.clearTimeout(copiedResetRef.current);
  }, []);

  const handleCopyPath = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!path) return;

    try {
      await writeClipboardText(path);
      setCopied(true);
      if (copiedResetRef.current !== null) window.clearTimeout(copiedResetRef.current);
      copiedResetRef.current = window.setTimeout(() => {
        setCopied(false);
        copiedResetRef.current = null;
      }, 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={`desktop-project-option-row ${selected ? "selected" : ""}`}>
      <button
        className={`desktop-menu-item desktop-project-option ${selected ? "selected" : ""}`}
        type="button"
        role="menuitem"
        title={item.title}
        onClick={onOpen}
      >
        <span className="desktop-menu-item-icon">
          <ProjectTypeMark kind={item.kind} className="desktop-project-mark" />
        </span>
        <span className="desktop-menu-item-body">
          <bdi className="desktop-menu-item-label">{item.label}</bdi>
          <bdi className="desktop-menu-item-detail">{item.detail}</bdi>
        </span>
      </button>
      {path ? (
        <button
          className={`desktop-project-copy-path ${copied ? "is-copied" : ""}`}
          type="button"
          aria-label={copied
            ? t("shell.workspaceSwitcher.pathCopied")
            : t("shell.workspaceSwitcher.copyPathFor", { project: bidiIsolate(item.label) })}
          title={t(copied ? "common.action.copied" : "shell.workspaceSwitcher.copyPath")}
          onClick={(event) => void handleCopyPath(event)}
        >
          {copied ? <Check size={13} strokeWidth={2.2} /> : <Copy size={13} strokeWidth={1.9} />}
        </button>
      ) : null}
    </div>
  );
}

export function getProjectCopyPath(item: DesktopWorkspaceSwitcherItem): string | null {
  const path = item.workspace.path?.trim();
  if (!path) return null;
  // Cloud status labels are not filesystem paths; only copy real workspace roots.
  if (item.kind === "cloud" && (path === item.detail || !looksLikeFilesystemPath(path))) {
    return null;
  }
  return path;
}

function looksLikeFilesystemPath(path: string): boolean {
  return path.includes("/") || path.includes("\\") || /^[A-Za-z]:/.test(path);
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
