import {
  ChevronDown,
  Clock3,
  Cloud,
  RefreshCw,
} from "lucide-react";
import { PageLoading } from "../../../components/loading";
import type { CloudBranchGraphRow } from "../graph/model";
import { formatRelativeTime, shortCommit } from "../utils";
import {
  HISTORY_GRAPH_ROW_HEIGHT,
  HistoryGraphVisual,
  getHistoryGraphWidth,
} from "./HistoryGraphVisual";
import type { CloudProjectHistoryProps } from "./types";

export function CloudProjectHistorySidebar({
  rows,
  selectedCommitId,
  loading,
  loadingMore,
  hasMore,
  error,
  warning,
  onSelectCommit,
  onRefresh,
  onLoadMore,
}: Pick<
  CloudProjectHistoryProps,
  | "rows"
  | "selectedCommitId"
  | "loading"
  | "loadingMore"
  | "hasMore"
  | "error"
  | "warning"
  | "onSelectCommit"
  | "onRefresh"
  | "onLoadMore"
>) {
  const commitRows = rows.filter((row) => row.kind === "commit");
  const graphWidth = getHistoryGraphWidth(rows);
  const notice = error ?? warning;

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
          <RefreshCw size={13} className={loading ? "spin" : undefined} aria-hidden="true" />
        </button>
      </header>

      {notice && rows.length > 0 && (
        <div className="desktop-cloud-history-sidebar-warning" role="status">
          {notice}
        </div>
      )}

      <ol className="desktop-cloud-history-sidebar-list" aria-label="Commit history">
        {loading && rows.length === 0 ? (
          <li className="desktop-cloud-history-sidebar-state">
            <PageLoading variant="fill" label="Loading history" className="desktop-cloud-history-sidebar-loading" />
          </li>
        ) : rows.length === 0 ? (
          <li className="desktop-cloud-history-sidebar-state">
            <CloudHistorySidebarEmpty error={error} />
          </li>
        ) : rows.map((row) => (
          <CloudHistorySidebarRow
            row={row}
            graphWidth={graphWidth}
            selected={row.id === selectedCommitId}
            onSelect={onSelectCommit}
            key={row.id}
          />
        ))}
      </ol>

      <footer className="desktop-cloud-history-sidebar-footer">
        <Cloud size={13} aria-hidden="true" />
        <span>Cloud repository</span>
        {hasMore && (
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => void onLoadMore()}
          >
            {loadingMore
              ? <RefreshCw size={11} className="spin" aria-hidden="true" />
              : <ChevronDown size={11} aria-hidden="true" />}
            Load more
          </button>
        )}
        <small>read-only</small>
      </footer>
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
  const contents = (
    <>
      <span className="desktop-cloud-history-graph-cell" style={{ width: graphWidth }} aria-hidden="true">
        <HistoryGraphVisual
          graphWidth={graphWidth}
          height={HISTORY_GRAPH_ROW_HEIGHT}
          line={row}
          continuationLines={row.continuationLines}
          refMarkers={row.refMarkers}
          node={isCommit ? {
            lane: row.nodeLane,
            color: row.nodeColor,
            current: isCurrentHead,
          } : undefined}
        />
      </span>
      <span className="desktop-cloud-history-sidebar-row-copy">
        <strong>
          <span>{row.message}</span>
          {isCurrentHead && <span className="desktop-cloud-history-inline-ref head">HEAD</span>}
          {row.labels.map((label) => (
            <span
              className={`desktop-cloud-history-inline-ref ${label.kind}`}
              key={`${label.kind}:${label.name}`}
            >
              {label.name}
            </span>
          ))}
        </strong>
        <span>
          {isCommit && <code>{shortCommit(row.id)}</code>}
          <small>{meta || "Unknown commit"}</small>
        </span>
      </span>
    </>
  );
  const className = `desktop-cloud-history-sidebar-row ${selected ? "active" : ""} ${isCommit ? "" : "ref-only"}`;

  return (
    <li className="desktop-cloud-history-sidebar-item" data-history-row-kind={row.kind}>
      {isCommit ? (
        <button
          className={className}
          type="button"
          aria-current={selected ? "true" : undefined}
          data-commit-id={row.id}
          title={`${row.message} (${shortCommit(row.id)})`}
          onClick={() => onSelect(row.id)}
        >
          {contents}
        </button>
      ) : (
        <div className={className} title={row.message}>
          {contents}
        </div>
      )}
    </li>
  );
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
