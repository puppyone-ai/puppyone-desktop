import { useLocalization } from "@puppyone/localization";
import type { GitEffectiveHostingKind, GitStatusSnapshot } from "../../types/electron";
import { GitOperationButton } from "../source-control/sidebar/GitSidebarPrimitives";

export type RemoteUpdateNoticeModel = Readonly<{
  provider: string;
  providerKind: GitEffectiveHostingKind;
  behind: number;
  fileCount: number;
  updatedAt: string | null;
  authorName: string | null;
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
    ? updateAge
      ? t("source-control.notice.summary", { relativeTime: updateAge, count: model.fileCount })
      : t("source-control.notice.fileCount", { count: model.fileCount })
    : updateAge
      ? t("source-control.notice.commitSummary", { relativeTime: updateAge, count: model.behind })
      : t("source-control.commit.commits", { count: model.behind });
  const attribution = model.authorName ?? model.provider;

  return (
    <aside
      className="desktop-remote-update-notice"
      data-diverged={model.diverged ? "true" : undefined}
      role="status"
      aria-live="polite"
    >
      <strong className="desktop-remote-update-notice-summary">{summary}</strong>
      <p className="desktop-remote-update-notice-meta">
        <span>{t("source-control.commit.commits", { count: model.behind })}</span>
        <span aria-hidden="true"> · </span>
        <span>{attribution}</span>
        {model.diverged && (
          <>
            <span aria-hidden="true"> · </span>
            <span>{t("source-control.notice.localChanges")}</span>
          </>
        )}
      </p>
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
    provider: getRemoteProviderLabel(status),
    providerKind: status.effectiveHosting.kind,
    behind: remote.behind,
    fileCount,
    updatedAt: remoteBranch?.lastCommitDate ?? null,
    authorName: remoteBranch?.lastCommitAuthorName?.trim() || null,
    canPull: remote.canPull,
    diverged: remote.state === "diverged",
  };
}

function getRemoteProviderLabel(status: GitStatusSnapshot) {
  if (status.effectiveHosting.kind === "github") return "GitHub";
  if (status.effectiveHosting.kind === "puppyone-cloud") return "PuppyOne Cloud";
  const remoteName = status.sourceControl.remote.target?.remote?.trim();
  if (remoteName?.toLowerCase() === "puppyone") return "PuppyOne";
  return remoteName || "Git remote";
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
