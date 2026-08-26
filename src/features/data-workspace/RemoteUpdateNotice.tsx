import { useLocalization } from "@puppyone/localization";
import type { GitSourceControlResourceStatus, GitStatusSnapshot } from "../../types/electron";
import { GitOperationButton } from "../source-control/sidebar/GitSidebarPrimitives";

type RemoteUpdateFilePreview = Readonly<{
  path: string;
  status: GitSourceControlResourceStatus;
}>;

export type RemoteUpdateNoticeModel = Readonly<{
  behind: number;
  fileCount: number;
  filePreviews: ReadonlyArray<RemoteUpdateFilePreview>;
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
  const summary = model.fileCount > 0
    ? t("source-control.notice.fileCount", { count: model.fileCount })
    : t("source-control.commit.changes", { count: model.behind });

  return (
    <aside
      className="desktop-remote-update-notice"
      data-diverged={model.diverged ? "true" : undefined}
      role="status"
      aria-live="polite"
    >
      <div className="desktop-remote-update-notice-heading">
        <span className="desktop-remote-update-notice-summary">{summary}</span>
      </div>
      {(updateAge || model.filePreviews.length > 0) && (
        <div className="desktop-remote-update-notice-meta">
          {updateAge && <span className="desktop-remote-update-notice-age">{updateAge}</span>}
          {model.filePreviews.length > 0 && (
            <span className="desktop-remote-update-notice-file-previews">
              {model.filePreviews.map((file) => {
                const statusLabel = t(`source-control.diff.change.${normalizePreviewStatus(file.status)}`);
                const fileName = getFileName(file.path);
                const displayName = getFileDisplayName(fileName);
                return (
                  <span
                    key={`${file.status}:${file.path}`}
                    className="desktop-remote-update-notice-file-preview"
                    data-status={file.status}
                    title={`${fileName} · ${statusLabel}`}
                  >
                    <span className="desktop-remote-update-notice-file-dot" aria-hidden="true" />
                    <span className="desktop-remote-update-notice-file-name">{displayName}</span>
                  </span>
                );
              })}
            </span>
          )}
        </div>
      )}
      <GitOperationButton
        className="desktop-remote-update-notice-pull"
        title={t("source-control.notice.pullTitle")}
        disabled={operationLoading !== null || !model.canPull}
        icon="download"
        label={t("source-control.sync.pull")}
        loadingKey="pull"
        loadingLabel={t("source-control.sync.pulling")}
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
    filePreviews: remote.incomingPreview.slice(0, 3).map(({ path, status }) => ({ path, status })),
    updatedAt: remoteBranch?.lastCommitDate ?? null,
    canPull: remote.canPull,
    diverged: remote.state === "diverged",
  };
}

function getFileName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

function getFileDisplayName(fileName: string) {
  const extensionIndex = fileName.lastIndexOf(".");
  return extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName;
}

function normalizePreviewStatus(status: GitSourceControlResourceStatus) {
  if (status === "untracked") return "added";
  if (status === "conflict") return "changed";
  return status;
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
