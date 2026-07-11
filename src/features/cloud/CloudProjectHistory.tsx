import { Fragment, type CSSProperties } from "react";
import {
  Clock3,
  Cloud,
  ExternalLink,
  FileMinus2,
  FilePenLine,
  FilePlus2,
  GitCommitHorizontal,
  RefreshCw,
} from "lucide-react";
import {
  openCloudApp,
  type DesktopCloudHistory,
  type DesktopCloudHistoryChange,
  type DesktopCloudHistoryCommit,
} from "../../lib/cloudApi";
import { PageLoading } from "../../components/loading";
import type {
  CloudBranchGraphLine,
  CloudBranchGraphRefMarker,
  CloudBranchGraphRow,
} from "./model";
import { formatRelativeTime, shortCommit } from "./utils";

const HISTORY_GRAPH_LANE_WIDTH = 14;
const HISTORY_GRAPH_LEFT_PAD = 9;
const HISTORY_GRAPH_RIGHT_PAD = 8;
const HISTORY_GRAPH_ROW_HEIGHT = 42;
const HISTORY_GRAPH_CONTINUATION_HEIGHT = 8;

export type CloudProjectHistoryProps = {
  projectId: string | null;
  projectName: string;
  history: DesktopCloudHistory | null;
  rows: CloudBranchGraphRow[];
  selectedCommitId: string | null;
  loading: boolean;
  error: string | null;
  onSelectCommit: (commitId: string) => void;
  onRefresh: () => void | Promise<void>;
};

export function CloudProjectHistorySidebar({
  rows,
  selectedCommitId,
  loading,
  error,
  onSelectCommit,
  onRefresh,
}: Pick<
  CloudProjectHistoryProps,
  "rows" | "selectedCommitId" | "loading" | "error" | "onSelectCommit" | "onRefresh"
>) {
  const commitRows = rows.filter((row) => row.kind === "commit");
  const graphWidth = getHistoryGraphWidth(rows);

  return (
    <section className="desktop-tool-sidebar desktop-cloud-history-sidebar" aria-label="Cloud project history">
      <header className="desktop-cloud-history-sidebar-header">
        <div>
          <Clock3 size={14} aria-hidden="true" />
          <span>History</span>
          <small>{commitRows.length}</small>
        </div>
        <button
          type="button"
          title="Refresh history"
          aria-label="Refresh history"
          disabled={loading}
          onClick={() => void onRefresh()}
        >
          <RefreshCw size={13} className={loading ? "spin" : undefined} />
        </button>
      </header>

      {error && rows.length > 0 && (
        <div className="desktop-cloud-history-sidebar-warning" role="status">
          {error}
        </div>
      )}

      <div className="desktop-cloud-history-sidebar-list" role="listbox" aria-label="Commit history">
        {loading && rows.length === 0 ? (
          <PageLoading variant="fill" label="Loading history" className="desktop-cloud-history-sidebar-loading" />
        ) : rows.length === 0 ? (
          <CloudHistorySidebarEmpty error={error} />
        ) : rows.map((row) => (
          <Fragment key={row.id}>
            <CloudHistorySidebarRow
              row={row}
              graphWidth={graphWidth}
              selected={row.id === selectedCommitId}
              onSelect={onSelectCommit}
            />
            {row.continuationLines.map((line, index) => (
              <div
                className="desktop-cloud-history-graph-continuation"
                key={`${row.id}:continuation:${index}`}
                aria-hidden="true"
              >
                <CloudHistoryGraphVisual
                  graphWidth={graphWidth}
                  height={HISTORY_GRAPH_CONTINUATION_HEIGHT}
                  line={line}
                />
              </div>
            ))}
          </Fragment>
        ))}
      </div>

      <footer className="desktop-cloud-history-sidebar-footer">
        <Cloud size={13} aria-hidden="true" />
        <span>Cloud repository</span>
        <small>read-only</small>
      </footer>
    </section>
  );
}

export function CloudProjectHistoryView({
  projectId,
  projectName,
  history,
  rows,
  selectedCommitId,
  loading,
  error,
  onRefresh,
}: CloudProjectHistoryProps) {
  const selectedRow = rows.find((row) => row.kind === "commit" && row.id === selectedCommitId) ?? null;
  const selectedCommit = history?.commits.find((commit) => commit.commit_id === selectedRow?.id) ?? null;
  const isHead = Boolean(
    selectedCommit && history?.head_commit_id && selectedCommit.commit_id === history.head_commit_id,
  );

  return (
    <section className="desktop-cloud-project-history-view">
      <header className="desktop-cloud-project-history-header">
        <div className="desktop-cloud-project-history-title">
          <Clock3 size={15} aria-hidden="true" />
          <div>
            <strong>History</strong>
            <span>{projectName}</span>
          </div>
        </div>
        <div className="desktop-cloud-project-history-actions">
          <button
            type="button"
            disabled={loading}
            onClick={() => void onRefresh()}
          >
            <RefreshCw size={13} className={loading ? "spin" : undefined} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            disabled={!projectId}
            onClick={() => projectId && openCloudApp(`/projects/${projectId}/changes`)}
          >
            <ExternalLink size={13} />
            <span>Open Cloud</span>
          </button>
        </div>
      </header>

      <div className="desktop-cloud-project-history-body">
        {loading && rows.length === 0 ? (
          <PageLoading variant="fill" label="Loading history" className="desktop-cloud-project-history-loading" />
        ) : error && rows.length === 0 ? (
          <CloudProjectHistoryEmpty
            title="History unavailable"
            detail={error}
            onRefresh={onRefresh}
          />
        ) : rows.length === 0 ? (
          <CloudProjectHistoryEmpty
            title="No commits yet"
            detail="Changes to this Cloud project will appear here as a read-only repository timeline."
            onRefresh={onRefresh}
          />
        ) : selectedCommit && selectedRow ? (
          <CloudCommitDetail
            projectId={projectId}
            commit={selectedCommit}
            row={selectedRow}
            isHead={isHead}
          />
        ) : (
          <CloudProjectHistoryEmpty
            title="Select a commit"
            detail="Choose a point in the history tree to inspect who changed which files."
          />
        )}
      </div>
    </section>
  );
}

function CloudHistorySidebarRow({
  row,
  graphWidth,
  selected,
  onSelect,
}: {
  row: CloudBranchGraphRow;
  graphWidth: number;
  selected: boolean;
  onSelect: (commitId: string) => void;
}) {
  const isCommit = row.kind === "commit";
  const isCurrentHead = row.labels.some((label) => label.current);
  const meta = [row.authorName, row.createdAt ? formatRelativeTime(row.createdAt) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      className={`desktop-cloud-history-sidebar-row ${selected ? "active" : ""} ${isCommit ? "" : "ref-only"}`}
      type="button"
      role="option"
      aria-selected={selected}
      disabled={!isCommit}
      title={isCommit ? `${row.message} (${shortCommit(row.id)})` : row.message}
      onClick={() => isCommit && onSelect(row.id)}
    >
      <span className="desktop-cloud-history-graph-cell" style={{ width: graphWidth }} aria-hidden="true">
        <CloudHistoryGraphVisual
          graphWidth={graphWidth}
          height={HISTORY_GRAPH_ROW_HEIGHT}
          line={row}
          refMarkers={row.refMarkers}
          node={isCommit ? {
            lane: row.nodeLane,
            color: row.nodeColor,
            current: isCurrentHead,
          } : undefined}
        />
      </span>
      <span className="desktop-cloud-history-sidebar-row-copy">
        <strong>{row.message}</strong>
        <span>
          {isCommit && <code>{shortCommit(row.id)}</code>}
          <small>{meta || "Unknown commit"}</small>
        </span>
      </span>
    </button>
  );
}

function CloudCommitDetail({
  projectId,
  commit,
  row,
  isHead,
}: {
  projectId: string | null;
  commit: DesktopCloudHistoryCommit;
  row: CloudBranchGraphRow;
  isHead: boolean;
}) {
  const changes = commit.changes ?? [];
  const exactTime = formatExactTime(commit.created_at);
  const author = commit.who || row.authorName || "Unknown";
  const authorInitial = author.trim().charAt(0).toUpperCase() || "?";

  return (
    <article className="desktop-cloud-commit-detail">
      <div className="desktop-cloud-commit-detail-summary">
        <div className="desktop-cloud-commit-detail-kicker">
          <GitCommitHorizontal size={14} aria-hidden="true" />
          <code title={commit.commit_id}>{shortCommit(commit.commit_id)}</code>
          {isHead && <span className="desktop-cloud-history-head-badge">HEAD</span>}
          {row.labels.map((label) => (
            <span className={`desktop-cloud-history-ref-badge ${label.kind}`} key={`${label.kind}:${label.name}`}>
              {label.name}
            </span>
          ))}
        </div>
        <h1>{commit.message || "Update workspace"}</h1>
        <div className="desktop-cloud-commit-author-row">
          <span className="desktop-cloud-commit-author-avatar" aria-hidden="true">{authorInitial}</span>
          <div>
            <strong>{author}</strong>
            <span title={exactTime || undefined}>
              {commit.created_at ? formatRelativeTime(commit.created_at) : "Time unavailable"}
              {exactTime ? ` · ${exactTime}` : ""}
            </span>
          </div>
        </div>
        <div className="desktop-cloud-commit-detail-stats">
          <span>{changes.length} file{changes.length === 1 ? "" : "s"} changed</span>
          <ChangeCount changes={changes} kind="added" />
          <ChangeCount changes={changes} kind="modified" />
          <ChangeCount changes={changes} kind="deleted" />
        </div>
      </div>

      <section className="desktop-cloud-commit-files" aria-label="Files changed in this commit">
        <header>
          <strong>Files changed</strong>
          <small>{changes.length}</small>
          {projectId && (
            <button
              type="button"
              onClick={() => openCloudApp(`/projects/${projectId}/changes?commit=${encodeURIComponent(commit.commit_id)}`)}
            >
              <ExternalLink size={13} />
              <span>View code changes</span>
            </button>
          )}
        </header>
        {changes.length > 0 ? (
          <div className="desktop-cloud-commit-file-list">
            {changes.map((change, index) => (
              <CloudCommitFileRow
                change={change}
                key={`${change.path}:${getCloudHistoryChangeKind(change)}:${index}`}
              />
            ))}
          </div>
        ) : (
          <div className="desktop-cloud-commit-files-empty">
            The server did not report path-level changes for this commit.
          </div>
        )}
      </section>

      {(commit.scope_path || commit.root_hash) && (
        <dl className="desktop-cloud-commit-technical-meta">
          {commit.scope_path && (
            <>
              <dt>Scope</dt>
              <dd><code>{commit.scope_path}</code></dd>
            </>
          )}
          {commit.root_hash && (
            <>
              <dt>Snapshot</dt>
              <dd><code title={commit.root_hash}>{shortCommit(commit.root_hash)}</code></dd>
            </>
          )}
        </dl>
      )}
    </article>
  );
}

function CloudCommitFileRow({ change }: { change: DesktopCloudHistoryChange }) {
  const kind = getCloudHistoryChangeKind(change);
  const config = {
    added: { label: "Added", shortLabel: "A", icon: FilePlus2 },
    modified: { label: "Modified", shortLabel: "M", icon: FilePenLine },
    deleted: { label: "Deleted", shortLabel: "D", icon: FileMinus2 },
  }[kind];
  const Icon = config.icon;

  return (
    <div className="desktop-cloud-commit-file-row" data-change-kind={kind}>
      <Icon size={14} aria-hidden="true" />
      <span title={change.path}>{change.path}</span>
      <small title={config.label}>{config.shortLabel}</small>
    </div>
  );
}

function ChangeCount({
  changes,
  kind,
}: {
  changes: DesktopCloudHistoryChange[];
  kind: ReturnType<typeof getCloudHistoryChangeKind>;
}) {
  const count = changes.filter((change) => getCloudHistoryChangeKind(change) === kind).length;
  if (count === 0) return null;
  return <span className={kind}>{count} {kind}</span>;
}

function CloudHistorySidebarEmpty({ error }: { error: string | null }) {
  return (
    <div className="desktop-cloud-history-sidebar-empty">
      <Clock3 size={18} aria-hidden="true" />
      <strong>{error ? "History unavailable" : "No commits yet"}</strong>
      <span>{error ?? "Cloud commits will appear here."}</span>
    </div>
  );
}

function CloudProjectHistoryEmpty({
  title,
  detail,
  onRefresh,
}: {
  title: string;
  detail: string;
  onRefresh?: () => void | Promise<void>;
}) {
  return (
    <div className="desktop-cloud-project-history-empty">
      <span><Clock3 size={26} aria-hidden="true" /></span>
      <strong>{title}</strong>
      <p>{detail}</p>
      {onRefresh && (
        <button type="button" onClick={() => void onRefresh()}>
          <RefreshCw size={13} />
          <span>Try again</span>
        </button>
      )}
    </div>
  );
}

function getHistoryGraphWidth(rows: CloudBranchGraphRow[]): number {
  const laneCount = Math.max(
    1,
    ...rows.flatMap((row) => [
      row.laneCount,
      row.nodeLane + 1,
      ...row.refMarkers.map((marker) => marker.lane + 1),
      ...row.continuationLines.map((line) => line.laneCount),
    ]),
  );
  return HISTORY_GRAPH_LEFT_PAD + laneCount * HISTORY_GRAPH_LANE_WIDTH + HISTORY_GRAPH_RIGHT_PAD;
}

function CloudHistoryGraphVisual({
  graphWidth,
  height,
  line,
  refMarkers = [],
  node,
}: {
  graphWidth: number;
  height: number;
  line: CloudBranchGraphLine;
  refMarkers?: CloudBranchGraphRefMarker[];
  node?: { lane: number; color: string; current: boolean };
}) {
  const middleY = height / 2;
  return (
    <svg
      className="desktop-cloud-history-graph-svg"
      width={graphWidth}
      height={height}
      viewBox={`0 0 ${graphWidth} ${height}`}
      focusable="false"
    >
      {line.segments.map((segment, index) => (
        <path
          className="desktop-cloud-history-graph-segment"
          key={`${index}:${segment.fromLane}:${segment.toLane}:${segment.from}:${segment.to}`}
          d={buildHistoryGraphSegmentPath(segment, height)}
          style={{ stroke: segment.color } as CSSProperties}
        />
      ))}
      {refMarkers.map((marker) => (
        <g
          className={`desktop-cloud-history-graph-ref ${marker.kind}`}
          key={`${marker.lane}:${marker.label}`}
          transform={`translate(${getHistoryGraphLaneX(marker.lane)} ${middleY})`}
        >
          <rect x="-5" y="-5" width="10" height="10" rx="3" style={{ fill: marker.color } as CSSProperties} />
          {marker.count > 1 && <text x="0" y="0">{marker.count}</text>}
        </g>
      ))}
      {node && (
        <g
          className={`desktop-cloud-history-graph-node ${node.current ? "current" : ""}`}
          transform={`translate(${getHistoryGraphLaneX(node.lane)} ${middleY})`}
        >
          <circle className="halo" r={node.current ? 7 : 6} />
          <circle
            className="node"
            r={node.current ? 4.8 : 4.3}
            style={{ fill: node.current ? node.color : "var(--po-panel)", stroke: node.color } as CSSProperties}
          />
          {node.current && <circle className="core" r="2" />}
        </g>
      )}
    </svg>
  );
}

function getHistoryGraphLaneX(lane: number): number {
  return HISTORY_GRAPH_LEFT_PAD + lane * HISTORY_GRAPH_LANE_WIDTH;
}

function getHistoryGraphY(position: CloudBranchGraphLine["segments"][number]["from"], height: number): number {
  if (position === "top") return 0;
  if (position === "bottom") return height;
  return height / 2;
}

function buildHistoryGraphSegmentPath(
  segment: CloudBranchGraphLine["segments"][number],
  height: number,
): string {
  const startX = getHistoryGraphLaneX(segment.fromLane);
  const endX = getHistoryGraphLaneX(segment.toLane);
  const startY = getHistoryGraphY(segment.from, height);
  const endY = getHistoryGraphY(segment.to, height);
  if (startX === endX || startY === endY) return `M ${startX} ${startY} L ${endX} ${endY}`;
  const controlY = startY + (endY - startY) / 2;
  return `M ${startX} ${startY} C ${startX} ${controlY}, ${endX} ${controlY}, ${endX} ${endY}`;
}

function getCloudHistoryChangeKind(change: DesktopCloudHistoryChange): "added" | "modified" | "deleted" {
  if (change.action === "add" || change.op === "added") return "added";
  if (change.action === "delete" || change.op === "deleted") return "deleted";
  return "modified";
}

function formatExactTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
