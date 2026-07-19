import { useLocalization } from "@puppyone/localization/react";
import type { DesktopCloudHistory } from "../../../../lib/cloudHistoryApi";
import {
  formatCloudGraphAuthor,
  formatCloudGraphLabel,
  formatCloudGraphRowMessage,
} from "../../cloudPresentation";
import {
  HistoryGraphVisual,
  getHistoryGraphWidth,
} from "../../graph/HistoryGraphVisual";
import { buildCloudBranchGraphRows } from "../../graph/model";
import { formatCloudDate } from "../../utils";

const OVERVIEW_HISTORY_ROW_HEIGHT = 42;
const OVERVIEW_HISTORY_ROW_LIMIT = 5;

export function CloudOverviewHistoryPreview({
  history,
}: {
  history: DesktopCloudHistory;
}) {
  const localization = useLocalization();
  const { t } = localization;
  const rows = buildCloudBranchGraphRows({ history }).slice(0, OVERVIEW_HISTORY_ROW_LIMIT);
  const graphWidth = getHistoryGraphWidth(rows);

  return (
    <span className="desktop-cloud-overview-history-preview" aria-hidden="true" dir="ltr">
      {rows.map((row) => {
        const isCommit = row.kind === "commit";
        const isCurrentHead = row.labels.some((label) => label.current);
        const message = formatCloudGraphRowMessage(row, t);
        const author = formatCloudGraphAuthor(row, t);
        const date = formatCloudDate(row.createdAt, localization.formatDate);
        const meta = [author, date].filter(Boolean).join(" · ");
        const visibleLabels = row.labels
          .filter((label) => formatCloudGraphLabel(label, t) !== "HEAD")
          .slice(0, 1);

        return (
          <span
            className="desktop-cloud-overview-history-preview-row"
            key={`${row.kind}:${row.id}`}
          >
            <span
              className="desktop-cloud-overview-history-preview-graph"
              style={{ width: graphWidth }}
            >
              <HistoryGraphVisual
                graphWidth={graphWidth}
                height={OVERVIEW_HISTORY_ROW_HEIGHT}
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
            <span className="desktop-cloud-overview-history-preview-copy">
              <span className="desktop-cloud-overview-history-preview-title">
                {isCurrentHead ? <em>HEAD</em> : null}
                <strong dir="auto">{message}</strong>
                {visibleLabels.map((label) => (
                  <i key={`${label.kind}:${label.nameCode ?? label.name}`}>
                    <bdi>{formatCloudGraphLabel(label, t)}</bdi>
                  </i>
                ))}
              </span>
              <small dir="auto">{meta}</small>
            </span>
          </span>
        );
      })}
    </span>
  );
}
