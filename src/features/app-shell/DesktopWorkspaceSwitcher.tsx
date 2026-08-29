import { useEffect, useRef, useState, type MouseEvent, type RefObject } from "react";
import type { Workspace } from "@puppyone/shared-ui";
import { ArrowLeft, Check, Copy, Folder, FolderOpen, FolderPlus } from "lucide-react";
import {
  DesktopMenuIconButton,
  DesktopMenuItem,
  DesktopMenuSection,
} from "../../components/DesktopMenu";
import { DesktopTitlebarMenuLayer } from "./DesktopTitlebarMenuLayer";
import { writeClipboardText } from "../settings/utils";
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
  onOpenItem: (item: DesktopWorkspaceSwitcherItem) => void;
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
  onOpenItem,
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
  const recentItems = items.filter((item) => item.id !== workspace.id);
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
        className="desktop-titlebar-workspace-button local"
        type="button"
        aria-label={t("shell.workspaceSwitcher.switch", {
          kind: t("shell.workspaceSwitcher.kind.local"),
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
        <DesktopMenuItem
          className="desktop-project-add desktop-project-home"
          icon={<ArrowLeft className="po-directional-icon" size={15} strokeWidth={1.9} />}
          label={t("shell.workspaceSwitcher.home")}
          onClick={onGoHome}
        />
        <div
          className="desktop-project-list"
          data-po-scrollbar="menu"
          data-workspace-menu-layout="project-switcher-v2"
        >
          <DesktopMenuSection
            className="desktop-project-section desktop-project-current-section"
            label={t("shell.workspaceSwitcher.currentWorkspace")}
          >
            {renderProjectRows([currentItem])}
            <DesktopMenuItem
              className="desktop-project-add desktop-project-add-folder"
              disabled={!onAddFolder}
              icon={<FolderPlus size={15} strokeWidth={1.8} />}
              label={t("shell.workspaceSwitcher.addProject")}
              onClick={onAddFolder}
            />
          </DesktopMenuSection>
          {recentItems.length > 0 ? (
            <DesktopMenuSection
              className="desktop-project-section desktop-project-recent-section"
              label={t("shell.workspaceSwitcher.recentProjects")}
            >
              {renderProjectRows(recentItems)}
            </DesktopMenuSection>
          ) : null}
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
      </button>
      {selected ? (
        <span className="desktop-project-current-indicator" aria-hidden="true">
          <Check size={14} strokeWidth={2.2} />
        </span>
      ) : null}
      {path ? (
        <DesktopMenuIconButton
          className={`desktop-project-copy-path ${copied ? "is-copied" : ""}`}
          label={copied
            ? t("shell.workspaceSwitcher.pathCopied")
            : t("shell.workspaceSwitcher.copyPathFor", { project: bidiIsolate(item.label) })}
          title={t(copied ? "common.action.copied" : "shell.workspaceSwitcher.copyPath")}
          icon={copied
            ? <Check size={13} strokeWidth={2.2} aria-hidden="true" />
            : <Copy size={13} strokeWidth={1.9} aria-hidden="true" />}
          onClick={(event) => void handleCopyPath(event)}
        />
      ) : null}
    </div>
  );
}

export function getProjectCopyPath(item: DesktopWorkspaceSwitcherItem): string | null {
  const path = item.workspace.path?.trim();
  if (!path) return null;
  return path;
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
