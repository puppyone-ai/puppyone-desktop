import { useLocalization } from "@puppyone/localization";
import type { GitStatusSnapshot } from "../../types/electron";
import { GitOperationButton } from "../source-control";

type RemoteUpdateFileChangeCounts = Readonly<{
  added: number;
  modified: number;
  deleted: number;
}>;

export type RemoteUpdateNoticeModel = Readonly<{
  behind: number;
  fileCount: number;
  fileChanges: RemoteUpdateFileChangeCounts;
  updatedAt: string | null;
  canPull: boolean;
  diverged: boolean;
}>;

export function RemoteUpdateNotice({
  status,
  operationLoading,
  onPull,
}: {
  status: GitStatusSnapshot | null;
  operationLoading: string | null;
  onPull: () => Promise<boolean>;
}) {
  const { t, formatRelativeTime } = useLocalization();
  const model = getRemoteUpdateNoticeModel(status);
  if (!model) return null;

  const updateAge = formatRemoteUpdateAge(model.updatedAt, formatRelativeTime);

  return (
    <aside
      className="desktop-remote-update-notice"
      data-diverged={model.diverged ? "true" : undefined}
      role="status"
      aria-live="polite"
    >
      <div className="desktop-remote-update-notice-heading">
        <span className="desktop-remote-update-notice-summary">
          {t("source-control.notice.filesChanged")}
        </span>
      </div>
      {(model.fileCount > 0 || updateAge || hasFileChangeCounts(model.fileChanges)) && (
        <div className="desktop-remote-update-notice-meta">
          {model.fileCount > 0 && (
            <span>{t("source-control.commit.files", { count: model.fileCount })}</span>
          )}
          {hasFileChangeCounts(model.fileChanges) && (
            <span className="desktop-remote-update-notice-change-counts">
              <RemoteUpdateChangeCount
                count={model.fileChanges.added}
                code="+"
                label={t("source-control.diff.change.added")}
                status="added"
              />
              <RemoteUpdateChangeCount
                count={model.fileChanges.modified}
                code="~"
                label={t("source-control.diff.change.modified")}
                status="modified"
              />
              <RemoteUpdateChangeCount
                count={model.fileChanges.deleted}
                code="−"
                label={t("source-control.diff.change.deleted")}
                status="deleted"
              />
            </span>
          )}
          {updateAge && <span className="desktop-remote-update-notice-age">{updateAge}</span>}
        </div>
      )}
      <GitOperationButton
        className="desktop-remote-update-notice-pull"
        title={t("source-control.notice.getChangesTitle")}
        disabled={operationLoading !== null || !model.canPull}
        icon="download"
        label={t("source-control.notice.get")}
        loadingKey="pull"
        loadingLabel={t("source-control.notice.gettingChanges")}
        operationLoading={operationLoading}
        primary
        onClick={() => void onPull()}
      />
    </aside>
  );
}

export function getRemoteUpdateNoticeModel(
  status: GitStatusSnapshot | null,
): RemoteUpdateNoticeModel | null {
  if (!status?.isRepo) return null;
  const remote = status.sourceControl.remote;
  if (remote.behind <= 0 || (remote.state !== "incoming" && remote.state !== "diverged")) {
    return null;
  }

  const previewPaths = new Set(remote.incomingPreview.map(({ path }) => path).filter(Boolean));
  const fileCount = Math.max(remote.incomingFileSummary?.total ?? 0, previewPaths.size);
  const targetRef = remote.target?.ref ?? status.effectiveHosting.ref;
  const remoteBranch = status.branches.find(
    (branch) => branch.remote && branch.name === targetRef,
  ) ?? null;

  return {
    behind: remote.behind,
    fileCount,
    fileChanges: getRemoteFileChangeCounts(remote),
    updatedAt: remoteBranch?.lastCommitDate ?? null,
    canPull: remote.canPull,
    diverged: remote.state === "diverged",
  };
}

function RemoteUpdateChangeCount({
  count,
  code,
  label,
  status,
}: {
  count: number;
  code: string;
  label: string;
  status: "added" | "modified" | "deleted";
}) {
  if (count <= 0) return null;
  return (
    <span
      className="desktop-remote-update-notice-change-count"
      data-status={status}
      title={`${label}: ${count}`}
    >
      <span aria-hidden="true">{code}</span>
      {count}
    </span>
  );
}

function getRemoteFileChangeCounts(
  remote: GitStatusSnapshot["sourceControl"]["remote"],
): RemoteUpdateFileChangeCounts {
  const summary = remote.incomingFileSummary;
  if (summary) {
    return {
      added: (summary.added ?? 0) + (summary.copied ?? 0),
      modified: (summary.modified ?? 0) + (summary.changed ?? 0) + (summary.renamed ?? 0),
      deleted: summary.deleted ?? 0,
    };
  }

  return remote.incomingPreview.reduce<RemoteUpdateFileChangeCounts>((counts, file) => {
    if (file.status === "added" || file.status === "untracked" || file.status === "copied") {
      return { ...counts, added: counts.added + 1 };
    }
    if (file.status === "deleted") return { ...counts, deleted: counts.deleted + 1 };
    return { ...counts, modified: counts.modified + 1 };
  }, { added: 0, modified: 0, deleted: 0 });
}

function hasFileChangeCounts(counts: RemoteUpdateFileChangeCounts) {
  return counts.added > 0 || counts.modified > 0 || counts.deleted > 0;
}

function formatRemoteUpdateAge(
  value: string | null,
  formatRelativeTime: ReturnType<typeof useLocalization>["formatRelativeTime"],
) {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(timestamp)) return null;

  const elapsedMs = Math.max(0, Date.now() - timestamp);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  const options = { numeric: "auto", style: "short" } as const;
  if (elapsedMs < minute) return formatRelativeTime(0, "second", options);
  if (elapsedMs < hour) return formatRelativeTime(-Math.floor(elapsedMs / minute), "minute", options);
  if (elapsedMs < day) return formatRelativeTime(-Math.floor(elapsedMs / hour), "hour", options);
  if (elapsedMs < week) return formatRelativeTime(-Math.floor(elapsedMs / day), "day", options);
  if (elapsedMs < month) return formatRelativeTime(-Math.floor(elapsedMs / week), "week", options);
  if (elapsedMs < year) return formatRelativeTime(-Math.floor(elapsedMs / month), "month", options);
  return formatRelativeTime(-Math.floor(elapsedMs / year), "year", options);
}
