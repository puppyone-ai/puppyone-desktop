import { ChevronRight, Minus, Plus, Undo2 } from "lucide-react";
import {
  FileGlyphIcon,
  VirtualSidebarList,
  shouldVirtualizeSidebarList,
  type FileIconThemeId,
} from "@puppyone/shared-ui";
import { Fragment, useId, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { GitSourceControlResource } from "../../types/electron";
import type { GitWorkingSelection } from "./types";
import { bidiIsolate, useLocalization, type MessageFormatter } from "@puppyone/localization";

export function SourceControlSectionHeader({
  title,
  count,
  summaryResources,
  highlightCount = false,
  leadingIcon,
  action,
  className,
  expanded = true,
  onToggle,
}: {
  title: string;
  count: number;
  summaryResources?: readonly GitSourceControlResource[];
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
      {summaryResources && summaryResources.length > 0 ? (
        <SourceControlResourceSummary resources={summaryResources} />
      ) : (
        <small className={highlightCount ? "desktop-git-section-count-badge" : undefined}>{count}</small>
      )}
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

type SourceControlResourceSummaryBucket = {
  key: "conflict" | "added" | "modified" | "deleted" | "renamed" | "copied";
  letter: "!" | "A" | "M" | "D" | "R" | "C";
  resources: readonly GitSourceControlResource[];
};

const SOURCE_CONTROL_RESOURCE_SUMMARY_ORDER = [
  ["conflict", "!"],
  ["added", "A"],
  ["modified", "M"],
  ["deleted", "D"],
  ["renamed", "R"],
  ["copied", "C"],
] as const;

export function SourceControlResourceSummary({
  resources,
}: {
  resources: readonly GitSourceControlResource[];
}) {
  const { t, formatNumber } = useLocalization();
  const tooltipId = useId();
  const [tooltip, setTooltip] = useState<{
    bucket: SourceControlResourceSummaryBucket;
    left: number;
    top: number;
  } | null>(null);
  const buckets = getSourceControlResourceSummaryBuckets(resources);
  const summaryLabel = buckets
    .map((bucket) => `${getSourceControlSummaryStatusLabel(bucket.key, t)} ${formatNumber(bucket.resources.length)}`)
    .join(", ");

  return (
    <span
      className="desktop-git-resource-summary"
      aria-label={`${t("source-control.commit.filesChanged", { count: resources.length })}. ${summaryLabel}`}
    >
      <small
        className="desktop-git-resource-summary-total"
        title={t("source-control.commit.filesChanged", { count: resources.length })}
      >
        {formatNumber(resources.length)}
      </small>
      {buckets.map((bucket) => (
        <small
          className={`desktop-git-resource-summary-chip ${bucket.key}`}
          aria-label={getSourceControlSummaryTooltip(bucket, t, formatNumber)}
          data-resource-status={bucket.key}
          aria-describedby={tooltip?.bucket.key === bucket.key ? tooltipId : undefined}
          onMouseEnter={(event) => setTooltip(getSourceControlSummaryTooltipPosition(event, bucket))}
          onMouseLeave={() => setTooltip(null)}
          key={bucket.key}
        >
          <b>{bucket.letter}</b>
          <span>{formatNumber(bucket.resources.length)}</span>
        </small>
      ))}
      {tooltip && createPortal(
        <div
          id={tooltipId}
          className={`desktop-git-resource-tooltip ${tooltip.bucket.key}`}
          role="tooltip"
          style={{ left: tooltip.left, top: tooltip.top }}
        >
          <strong>
            <span>{getSourceControlSummaryStatusLabel(tooltip.bucket.key, t)}</span>
            <small>{formatNumber(tooltip.bucket.resources.length)}</small>
          </strong>
          <div>
            {tooltip.bucket.resources.slice(0, 8).map((resource) => (
              <bdi key={resource.id}>{getGitDisplayPath(resource)}</bdi>
            ))}
            {tooltip.bucket.resources.length > 8 && (
              <small>+{formatNumber(tooltip.bucket.resources.length - 8)}</small>
            )}
          </div>
        </div>,
        document.querySelector(".app-shell") ?? document.body,
      )}
    </span>
  );
}

function getSourceControlSummaryTooltipPosition(
  event: ReactMouseEvent<HTMLElement>,
  bucket: SourceControlResourceSummaryBucket,
) {
  const rect = event.currentTarget.getBoundingClientRect();
  const width = 260;
  const height = Math.min(220, 44 + (Math.min(bucket.resources.length, 8) * 22));
  const viewportWidth = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
  const viewportHeight = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
  const preferredLeft = rect.right + 8;
  const left = preferredLeft + width <= viewportWidth - 8
    ? preferredLeft
    : Math.max(8, rect.left - width - 8);
  const top = Math.min(Math.max(8, rect.top), Math.max(8, viewportHeight - height - 8));
  return { bucket, left, top };
}

export function getSourceControlResourceSummaryBuckets(
  resources: readonly GitSourceControlResource[],
): SourceControlResourceSummaryBucket[] {
  return SOURCE_CONTROL_RESOURCE_SUMMARY_ORDER.flatMap(([key, letter]) => {
    const matching = resources.filter((resource) => getSourceControlSummaryStatus(resource.status) === key);
    return matching.length > 0 ? [{ key, letter, resources: matching }] : [];
  });
}

function getSourceControlSummaryStatus(status: GitSourceControlResource["status"]): SourceControlResourceSummaryBucket["key"] {
  if (status === "conflict") return "conflict";
  if (status === "added" || status === "untracked") return "added";
  if (status === "deleted") return "deleted";
  if (status === "renamed") return "renamed";
  if (status === "copied") return "copied";
  return "modified";
}

function getSourceControlSummaryStatusLabel(
  status: SourceControlResourceSummaryBucket["key"],
  t: MessageFormatter,
) {
  if (status === "conflict") return t("source-control.section.merge");
  return t(`source-control.diff.change.${status}`);
}

function getSourceControlSummaryTooltip(
  bucket: SourceControlResourceSummaryBucket,
  t: MessageFormatter,
  formatNumber: (value: number) => string,
) {
  const label = getSourceControlSummaryStatusLabel(bucket.key, t);
  const visiblePaths = bucket.resources.slice(0, 8).map((resource) => getGitDisplayPath(resource));
  const hiddenCount = bucket.resources.length - visiblePaths.length;
  return [
    `${label} · ${formatNumber(bucket.resources.length)}`,
    ...visiblePaths,
    ...(hiddenCount > 0 ? [`+${formatNumber(hiddenCount)}`] : []),
  ].join("\n");
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
    <div
      className={`desktop-git-remote-preview desktop-git-${origin}-preview`}
      data-po-scrollbar="sidebar"
      aria-label={ariaLabel}
    >
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
