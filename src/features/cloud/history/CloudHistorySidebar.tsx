import {
  ChevronDown,
  Clock3,
  Cloud,
  RefreshCw,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useLocalization } from "@puppyone/localization/react";
import { SidebarRoot, VirtualSidebarList } from "@puppyone/shared-ui";
import { PageLoading } from "../../../components/loading";
import type { CloudBranchGraphRow } from "../graph/model";
import {
  formatCloudGraphAuthor,
  formatCloudGraphLabel,
  formatCloudGraphRowMessage,
} from "../cloudPresentation";
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
  const { formatNumber, t } = useLocalization();
  const commitRows = rows.filter((row) => row.kind === "commit");
  const graphWidth = getHistoryGraphWidth(rows);
  const notice = error ?? warning;

  return (
    <SidebarRoot className="desktop-cloud-history-sidebar" aria-label={t("cloud.history.projectHistory")}>
      <header className="desktop-cloud-history-sidebar-header">
        <div>
          <Clock3 size={14} aria-hidden="true" />
          <span>{t("cloud.route.history.title")}</span>
          <small>{formatNumber(commitRows.length)}</small>
        </div>
        <button
          type="button"
          title={t("cloud.history.refresh")}
          aria-label={t("cloud.history.refresh")}
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

      {rows.length > 0 ? (
        <VirtualSidebarList
          className="desktop-cloud-history-sidebar-list"
          ariaLabel={t("cloud.history.commitHistory")}
          items={rows}
          rowSize={HISTORY_GRAPH_ROW_HEIGHT}
          activeIndex={rows.findIndex((row) => row.id === selectedCommitId)}
          getKey={(row) => row.id}
          renderRow={(row) => (
            <CloudHistorySidebarRow
              row={row}
              graphWidth={graphWidth}
              selected={row.id === selectedCommitId}
              onSelect={onSelectCommit}
            />
          )}
        />
      ) : (
        <ol className="desktop-cloud-history-sidebar-list" aria-label={t("cloud.history.commitHistory")}>
          <li className="desktop-cloud-history-sidebar-state">
            {loading ? (
            <PageLoading variant="fill" label={t("cloud.history.loading")} className="desktop-cloud-history-sidebar-loading" />
            ) : (
            <CloudHistorySidebarEmpty error={error} />
            )}
          </li>
        </ol>
      )}

      <footer className="desktop-cloud-history-sidebar-footer">
        <Cloud size={13} aria-hidden="true" />
        <span>{t("cloud.history.cloudRepository")}</span>
        {hasMore && (
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => void onLoadMore()}
          >
            {loadingMore
              ? <RefreshCw size={11} className="spin" aria-hidden="true" />
              : <ChevronDown size={11} aria-hidden="true" />}
            {t("cloud.common.loadMore")}
          </button>
        )}
        <small>{t("cloud.scope.readOnly")}</small>
      </footer>
    </SidebarRoot>
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
  const localization = useLocalization();
  const { t } = localization;
  const isCommit = row.kind === "commit";
  const isCurrentHead = row.labels.some((label) => label.current);
  const message = formatCloudGraphRowMessage(row, t);
  const author = formatCloudGraphAuthor(row, t);
  const meta = [author, row.createdAt ? formatRelativeTime(row.createdAt, localization) : null]
    .filter(Boolean)
    .join(" · ");
  const contents = (
    <>
      <span
        className="desktop-cloud-history-graph-cell"
        style={getCloudHistoryGraphCellStyle(graphWidth)}
        aria-hidden="true"
        dir="ltr"
      >
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
          <span dir="auto">{message}</span>
          {isCurrentHead && <span className="desktop-cloud-history-inline-ref head">HEAD</span>}
          {row.labels.map((label) => (
            <span
              className={`desktop-cloud-history-inline-ref ${label.kind}`}
              key={`${label.kind}:${label.nameCode ?? label.name}`}
            >
              <bdi>{formatCloudGraphLabel(label, t)}</bdi>
            </span>
          ))}
        </strong>
        <span>
          {isCommit && <code dir="ltr">{shortCommit(row.id)}</code>}
          <small dir="auto">{meta || t("cloud.history.unknownCommit")}</small>
        </span>
      </span>
    </>
  );
  const className = `desktop-cloud-history-sidebar-row ${selected ? "active" : ""} ${isCommit ? "" : "ref-only"}`;

  return (
    <div className="desktop-cloud-history-sidebar-item" data-history-row-kind={row.kind}>
      {isCommit ? (
        <button
          className={className}
          type="button"
          aria-current={selected ? "true" : undefined}
          data-commit-id={row.id}
          title={`${message} (${shortCommit(row.id)})`}
          onClick={() => onSelect(row.id)}
        >
          {contents}
        </button>
      ) : (
        <div className={className} title={message}>
          {contents}
        </div>
      )}
    </div>
  );
}

function getCloudHistoryGraphCellStyle(graphWidth: number): CSSProperties {
  return { "--cloud-history-graph-width": `${graphWidth}px` } as CSSProperties;
}

function CloudHistorySidebarEmpty({ error }: { error: string | null }) {
  const { t } = useLocalization();
  return (
    <div className="desktop-cloud-history-sidebar-empty">
      <Clock3 size={18} aria-hidden="true" />
      <strong>{t(error ? "cloud.history.unavailable" : "cloud.history.noCommits")}</strong>
      <span>{error ?? t("cloud.history.commitsAppearHere")}</span>
    </div>
  );
}
