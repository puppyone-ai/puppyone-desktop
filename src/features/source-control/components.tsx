import { ChevronRight, Minus, Plus, Undo2 } from "lucide-react";
import { FileGlyphIcon, type FileIconThemeId } from "@puppyone/shared-ui";
import type { ReactNode } from "react";
import type { GitSourceControlResource } from "../../types/electron";
import type { GitWorkingSelection } from "./types";

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
      {onToggle && <ChevronRight size={13} className={expanded ? "expanded" : undefined} />}
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
  return (
    <div className={`desktop-git-remote-preview desktop-git-${origin}-preview`} aria-label={ariaLabel}>
      {resources.map((resource) => {
        const displayPath = getGitDisplayPath(resource);
        const displayParts = splitGitDisplayPath(displayPath);
        const selected = selectedWorkingFile?.origin === origin && selectedWorkingFile.path === resource.path;
        return (
          <div className={`desktop-working-tree-row desktop-git-remote-preview-row ${selected ? "active" : ""}`} key={resource.id} title={displayPath}>
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
                <FileGlyphIcon name={resource.path} size={15} theme={fileIconTheme} />
              </span>
              <span className="desktop-working-tree-copy">
                <span className="desktop-working-tree-name">{displayParts.name}</span>
                {displayParts.directory && <span className="desktop-working-tree-dir">{displayParts.directory}</span>}
              </span>
            </button>
            <span className={`desktop-working-tree-state ${resource.status}`}>{resource.letter}</span>
          </div>
        );
      })}
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
  const disabled = Boolean(operationLoading);
  const commandPaths = getGitResourceCommandPaths(resource);
  const displayPath = getGitDisplayPath(resource);
  const displayParts = splitGitDisplayPath(displayPath);
  const statusCode = resource.letter;
  const staged = resource.group === "index";

  return (
    <div className={`desktop-working-tree-row ${selected ? "active" : ""}`} title={displayPath}>
      <button
        className="desktop-working-tree-main"
        type="button"
        onClick={() => onSelect({ path: resource.path, status: resource.status, staged })}
      >
        <span className="desktop-working-tree-icon">
          <FileGlyphIcon name={resource.path} size={15} theme={fileIconTheme} />
        </span>
        <span className="desktop-working-tree-copy">
          <span className="desktop-working-tree-name">{displayParts.name}</span>
          {displayParts.directory && <span className="desktop-working-tree-dir">{displayParts.directory}</span>}
        </span>
      </button>
      <span className={`desktop-working-tree-state ${resource.status}`}>{statusCode}</span>
      <div className="desktop-working-tree-actions">
        {staged ? (
          <button
            className="desktop-tool-sidebar-icon"
            type="button"
            title="Unstage"
            aria-label={`Unstage ${resource.path}`}
            disabled={disabled}
            onClick={() => void onUnstagePaths(commandPaths)}
          >
            <Minus size={13} />
          </button>
        ) : (
          <>
            <button
              className="desktop-tool-sidebar-icon"
              type="button"
              title="Discard"
              aria-label={`Discard ${resource.path}`}
              disabled={disabled}
              onClick={() => void onDiscardPaths(commandPaths)}
            >
              <Undo2 size={13} />
            </button>
            <button
              className="desktop-tool-sidebar-icon"
              type="button"
              title="Stage"
              aria-label={`Stage ${resource.path}`}
              disabled={disabled}
              onClick={() => void onStagePaths(commandPaths)}
            >
              <Plus size={13} />
            </button>
          </>
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

function getGitDisplayPath(resource: GitSourceControlResource) {
  return resource.oldPath && resource.oldPath !== resource.path ? `${resource.oldPath} -> ${resource.path}` : resource.path;
}

function splitGitDisplayPath(path: string) {
  if (path.includes(" -> ")) {
    const [oldPath, newPath] = path.split(" -> ");
    const oldParts = splitSimplePath(oldPath);
    const newParts = splitSimplePath(newPath);
    return {
      name: `${oldParts.name} -> ${newParts.name}`,
      directory: newParts.directory || oldParts.directory,
    };
  }

  return splitSimplePath(path);
}

function splitSimplePath(path: string) {
  const segments = path.split("/");
  const name = segments.pop() || path;
  return {
    name,
    directory: segments.join("/"),
  };
}
