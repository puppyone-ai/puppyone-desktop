import { ChevronRight, Minus, Plus, Undo2 } from "lucide-react";
import {
  FileGlyphIcon,
  VirtualSidebarList,
  shouldVirtualizeSidebarList,
  type FileIconThemeId,
} from "@puppyone/shared-ui";
import { Fragment, type ReactNode } from "react";
import type { GitSourceControlResource } from "../../types/electron";
import type { GitWorkingSelection } from "./types";
import { bidiIsolate, useLocalization } from "@puppyone/localization";

export function SourceControlSectionHeader({
  title,
  count,
  highlightCount = false,
  leadingIcon,
  action,
  className,
  expanded = true,
  onToggle,
}: {
  title: string;
  count: number;
  highlightCount?: boolean;
  leadingIcon?: ReactNode;
  action?: ReactNode;
  className?: string;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const titleContent = (
    <>
      {onToggle && <ChevronRight size={14} className={`po-disclosure-icon ${expanded ? "expanded" : ""}`} />}
      {leadingIcon && <span className="desktop-git-section-leading-icon">{leadingIcon}</span>}
      <span>{title}</span>
      <small className={highlightCount ? "desktop-git-section-count-badge" : undefined}>{count}</small>
    </>
  );

  return (
    <div className={`desktop-git-section-row ${className ?? ""}`}>
      {onToggle ? (
        <button className="desktop-git-section-title" type="button" onClick={onToggle}>
          {titleContent}
        </button>
      ) : (
        <div className="desktop-git-section-title">
          {titleContent}
        </div>
      )}
      {action}
    </div>
  );
}

export function SourceControlPreviewResourceList({
  resources,
  fileIconTheme,
  selectedWorkingFile,
  origin,
  ariaLabel,
  onSelectWorkingFile,
}: {
  resources: GitSourceControlResource[];
  fileIconTheme: FileIconThemeId;
  selectedWorkingFile: GitWorkingSelection | null;
  origin: "remote" | "committed";
  ariaLabel: string;
  onSelectWorkingFile: (selection: GitWorkingSelection) => void;
}) {
  const renderResource = (resource: GitSourceControlResource) => (
    <SourceControlPreviewResourceRow
      resource={resource}
      fileIconTheme={fileIconTheme}
      selected={selectedWorkingFile?.origin === origin && selectedWorkingFile.path === resource.path}
      origin={origin}
      onSelectWorkingFile={onSelectWorkingFile}
    />
  );

  if (shouldVirtualizeSidebarList(resources.length)) {
    return (
      <VirtualSidebarList
        className={`desktop-git-remote-preview desktop-git-${origin}-preview desktop-git-preview-virtual-list`}
        ariaLabel={ariaLabel}
        items={resources}
        rowSize={32}
        getKey={(resource) => resource.id}
        renderRow={renderResource}
      />
    );
  }

  return (
    <div className={`desktop-git-remote-preview desktop-git-${origin}-preview`} aria-label={ariaLabel}>
      {resources.map((resource) => (
        <Fragment key={resource.id}>{renderResource(resource)}</Fragment>
      ))}
    </div>
  );
}

function SourceControlPreviewResourceRow({
  resource,
  fileIconTheme,
  selected,
  origin,
  onSelectWorkingFile,
}: {
  resource: GitSourceControlResource;
  fileIconTheme: FileIconThemeId;
  selected: boolean;
  origin: "remote" | "committed";
  onSelectWorkingFile: (selection: GitWorkingSelection) => void;
}) {
  const displayPath = getGitDisplayPath(resource);
  const displayName = getGitDisplayName(displayPath);
  return (
    <div className={`desktop-working-tree-row desktop-git-remote-preview-row ${selected ? "active" : ""}`} title={displayPath}>
      <button
        className="desktop-working-tree-main"
        type="button"
        onClick={() => onSelectWorkingFile({
          path: resource.path,
          status: resource.status,
          staged: false,
          origin,
        })}
      >
        <span className="desktop-working-tree-icon">
          <FileGlyphIcon name={getGitResourceIconName(resource)} size={18} theme={fileIconTheme} />
        </span>
        <span className="desktop-working-tree-copy">
          <span className="desktop-working-tree-name">{displayName}</span>
        </span>
      </button>
      <div className="desktop-working-tree-state-slot">
        <span className={`desktop-working-tree-state ${resource.status}`}>{resource.letter}</span>
      </div>
    </div>
  );
}

export function SourceControlWorkingTreeRow({
  resource,
  selected,
  operationLoading,
  fileIconTheme,
  onSelect,
  onStagePaths,
  onUnstagePaths,
  onDiscardPaths,
}: {
  resource: GitSourceControlResource;
  selected: boolean;
  operationLoading: string | null;
  fileIconTheme: FileIconThemeId;
  onSelect: (selection: GitWorkingSelection) => void;
  onStagePaths: (paths: string[]) => Promise<boolean>;
  onUnstagePaths: (paths: string[]) => Promise<boolean>;
  onDiscardPaths: (paths: string[]) => Promise<boolean>;
}) {
  const { t } = useLocalization();
  const disabled = Boolean(operationLoading);
  const commandPaths = getGitResourceCommandPaths(resource);
  const displayPath = getGitDisplayPath(resource);
  const displayName = getGitDisplayName(displayPath);
  const statusCode = resource.letter;
  const staged = resource.group === "index";

  return (
    <div
      className={`desktop-working-tree-row ${staged ? "is-staged" : "is-unstaged"} ${selected ? "active" : ""}`}
      title={displayPath}
    >
      <button
        className="desktop-working-tree-main"
        type="button"
        onClick={() => onSelect({ path: resource.path, status: resource.status, staged })}
      >
        <span className="desktop-working-tree-icon">
          <FileGlyphIcon name={getGitResourceIconName(resource)} size={18} theme={fileIconTheme} />
        </span>
        <span className="desktop-working-tree-copy">
          <span className="desktop-working-tree-name">{displayName}</span>
        </span>
      </button>
      {!staged && (
        <button
          className="po-sidebar-icon-button danger desktop-working-tree-revert-action"
          type="button"
          title={t("source-control.action.discard")}
          aria-label={t("source-control.action.discardPath", { path: bidiIsolate(resource.path) })}
          disabled={disabled}
          onClick={() => void onDiscardPaths(commandPaths)}
        >
          <Undo2 size={13} />
        </button>
      )}
      <div className="desktop-working-tree-state-slot">
        <span className={`desktop-working-tree-state ${resource.status}`}>{statusCode}</span>
        {staged ? (
          <button
            className="po-sidebar-icon-button desktop-working-tree-state-action"
            type="button"
            title={t("source-control.action.unstage")}
            aria-label={t("source-control.action.unstagePath", { path: bidiIsolate(resource.path) })}
            disabled={disabled}
            onClick={() => void onUnstagePaths(commandPaths)}
          >
            <Minus size={13} />
          </button>
        ) : (
          <button
            className="po-sidebar-icon-button desktop-working-tree-state-action"
            type="button"
            title={t("source-control.action.stage")}
            aria-label={t("source-control.action.stagePath", { path: bidiIsolate(resource.path) })}
            disabled={disabled}
            onClick={() => void onStagePaths(commandPaths)}
          >
            <Plus size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

function getGitResourceCommandPaths(resource: GitSourceControlResource) {
  return resource.oldPath && resource.oldPath !== resource.path
    ? [resource.oldPath, resource.path]
    : [resource.path];
}

function getGitResourceIconName(resource: GitSourceControlResource) {
  return getPathBasename(resource.path);
}

function getGitDisplayPath(resource: GitSourceControlResource) {
  return resource.oldPath && resource.oldPath !== resource.path ? `${resource.oldPath} -> ${resource.path}` : resource.path;
}

function getGitDisplayName(path: string) {
  if (path.includes(" -> ")) {
    const [oldPath, newPath] = path.split(" -> ");
    return `${getPathBasename(oldPath)} -> ${getPathBasename(newPath)}`;
  }

  return getPathBasename(path);
}

function getPathBasename(path: string) {
  const segments = path.split("/");
  return segments.pop() || path;
}
