import { Cloud, Download, GitBranch, Github, LoaderCircle } from "lucide-react";
import { useLocalization } from "@puppyone/localization";
import type { GitEffectiveHostingKind, GitStatusSnapshot } from "../../types/electron";

const MAX_VISIBLE_FILE_NAMES = 2;

export type RemoteUpdateNoticeModel = Readonly<{
  provider: string;
  providerKind: GitEffectiveHostingKind;
  behind: number;
  fileCount: number;
  fileNames: readonly string[];
  hiddenFileCount: number;
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
  const pulling = operationLoading === "pull";
  const busy = operationLoading !== null;
  const fileSummary = model.fileNames.length > 0
    ? t("source-control.notice.fileNames", {
        files: model.fileNames.join(", "),
        hidden: model.hiddenFileCount,
      })
    : model.fileCount > 0
      ? t("source-control.notice.fileCount", { count: model.fileCount })
      : t("source-control.notice.changesAvailable");

  return (
    <aside
      className="desktop-remote-update-notice"
      data-diverged={model.diverged ? "true" : undefined}
      role="status"
      aria-live="polite"
    >
      <div className="desktop-remote-update-notice-heading">
        <span className="desktop-remote-update-notice-icon" aria-hidden="true">
          <RemoteProviderIcon kind={model.providerKind} />
        </span>
        <strong>{t("source-control.notice.title")}</strong>
        <button
          className="desktop-remote-update-notice-pull"
          type="button"
          disabled={busy || !model.canPull}
          title={t("source-control.notice.pullTitle")}
          onClick={() => void onPull()}
        >
          {pulling
            ? <LoaderCircle className="desktop-remote-update-notice-spinner" size={13} aria-hidden="true" />
            : <Download size={13} strokeWidth={2.2} aria-hidden="true" />}
          <span>{t(pulling ? "source-control.sync.pulling" : "source-control.sync.pull")}</span>
        </button>
      </div>
      <p className="desktop-remote-update-notice-files" title={model.fileNames.join("\n") || undefined}>
        {fileSummary}
      </p>
      <p className="desktop-remote-update-notice-meta">
        <span>{model.provider}</span>
        {updateAge && (
          <>
            <span aria-hidden="true"> · </span>
            <time dateTime={model.updatedAt ?? undefined}>{updateAge}</time>
          </>
        )}
        <span aria-hidden="true"> · </span>
        <span>{t("source-control.commit.commits", { count: model.behind })}</span>
      </p>
      {model.diverged && (
        <p className="desktop-remote-update-notice-diverged">
          {t("source-control.notice.diverged")}
        </p>
      )}
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

  const previewPaths = Array.from(new Set(remote.incomingPreview.map(({ path }) => path).filter(Boolean)));
  const fileCount = Math.max(remote.incomingFileSummary?.total ?? 0, previewPaths.length);
  const fileNames = previewPaths
    .slice(0, MAX_VISIBLE_FILE_NAMES)
    .map(toDisplayFileName);
  const targetRef = remote.target?.ref ?? status.effectiveHosting.ref;
  const updatedAt = status.branches.find(
    (branch) => branch.remote && branch.name === targetRef,
  )?.lastCommitDate ?? null;

  return {
    provider: getRemoteProviderLabel(status),
    providerKind: status.effectiveHosting.kind,
    behind: remote.behind,
    fileCount,
    fileNames,
    hiddenFileCount: Math.max(0, fileCount - fileNames.length),
    updatedAt,
    canPull: remote.canPull,
    diverged: remote.state === "diverged",
  };
}

function RemoteProviderIcon({ kind }: { kind: GitEffectiveHostingKind }) {
  if (kind === "github") return <Github size={14} strokeWidth={2} />;
  if (kind === "puppyone-cloud") return <Cloud size={14} strokeWidth={2} />;
  return <GitBranch size={14} strokeWidth={2} />;
}

function getRemoteProviderLabel(status: GitStatusSnapshot) {
  if (status.effectiveHosting.kind === "github") return "GitHub";
  if (status.effectiveHosting.kind === "puppyone-cloud") return "PuppyOne Cloud";
  const remoteName = status.sourceControl.remote.target?.remote?.trim();
  if (remoteName?.toLowerCase() === "puppyone") return "PuppyOne";
  return remoteName || "Git remote";
}

function toDisplayFileName(path: string) {
  return path.replace(/\\/g, "/").split("/").filter(Boolean).at(-1) || path;
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

  if (elapsedMs < minute) return formatRelativeTime(0, "second", { numeric: "auto" });
  if (elapsedMs < hour) return formatRelativeTime(-Math.floor(elapsedMs / minute), "minute", { numeric: "auto" });
  if (elapsedMs < day) return formatRelativeTime(-Math.floor(elapsedMs / hour), "hour", { numeric: "auto" });
  if (elapsedMs < week) return formatRelativeTime(-Math.floor(elapsedMs / day), "day", { numeric: "auto" });
  if (elapsedMs < month) return formatRelativeTime(-Math.floor(elapsedMs / week), "week", { numeric: "auto" });
  if (elapsedMs < year) return formatRelativeTime(-Math.floor(elapsedMs / month), "month", { numeric: "auto" });
  return formatRelativeTime(-Math.floor(elapsedMs / year), "year", { numeric: "auto" });
}
