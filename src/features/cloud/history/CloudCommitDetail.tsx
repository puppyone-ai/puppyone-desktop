import {
  ExternalLink,
  FileMinus2,
  FilePenLine,
  FilePlus2,
  GitCommitHorizontal,
} from "lucide-react";
import { useLocalization } from "@puppyone/localization/react";
import { openCloudApp } from "../../../lib/cloudApi";
import type {
  DesktopCloudHistoryChange,
  DesktopCloudHistoryCommit,
} from "../../../lib/cloudHistoryApi";
import type { CloudBranchGraphRow } from "../graph/model";
import { formatCloudGraphAuthor, formatCloudGraphLabel } from "../cloudPresentation";
import { formatRelativeTime, shortCommit } from "../utils";

export function CloudCommitDetail({
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
  const localization = useLocalization();
  const { formatDate, formatNumber, t } = localization;
  const changes = commit.changes;
  const exactTime = commit.created_at ? formatDate(commit.created_at, {
    year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }) : "";
  const author = commit.who || formatCloudGraphAuthor(row, t);
  const authorInitial = author.trim().charAt(0).toUpperCase() || "?";

  return (
    <article className="desktop-cloud-commit-detail">
      <div className="desktop-cloud-commit-detail-summary">
        <div className="desktop-cloud-commit-detail-kicker">
          <GitCommitHorizontal size={14} aria-hidden="true" />
          <code title={commit.commit_id} dir="ltr">{shortCommit(commit.commit_id)}</code>
          {isHead && <span className="desktop-cloud-history-head-badge">HEAD</span>}
          {row.labels.map((label) => (
            <span className={`desktop-cloud-history-ref-badge ${label.kind}`} key={`${label.kind}:${label.nameCode ?? label.name}`}>
              <bdi>{formatCloudGraphLabel(label, t)}</bdi>
            </span>
          ))}
        </div>
        <h1 dir="auto">{commit.message || t("cloud.history.updateWorkspace")}</h1>
        <div className="desktop-cloud-commit-author-row">
          <span className="desktop-cloud-commit-author-avatar" aria-hidden="true">{authorInitial}</span>
          <div>
            <strong dir="auto">{author}</strong>
            <span title={exactTime || undefined}>
              {commit.created_at ? formatRelativeTime(commit.created_at, localization) : t("cloud.history.timeUnavailable")}
              {exactTime ? ` · ${exactTime}` : ""}
            </span>
          </div>
        </div>
        <div className="desktop-cloud-commit-detail-stats">
          <span>{t("cloud.history.fileChangeCount", { count: changes.length })}</span>
          <ChangeCount changes={changes} kind="added" />
          <ChangeCount changes={changes} kind="modified" />
          <ChangeCount changes={changes} kind="deleted" />
        </div>
      </div>

      <section className="desktop-cloud-commit-files" aria-label={t("cloud.history.filesChangedAria")}>
        <header>
          <strong>{t("cloud.history.filesChanged")}</strong>
          <small>{formatNumber(changes.length)}</small>
          {projectId && (
            <button
              type="button"
              onClick={() => openCloudApp(`/projects/${projectId}/changes?commit=${encodeURIComponent(commit.commit_id)}`)}
            >
              <ExternalLink size={13} aria-hidden="true" />
              <span>{t("cloud.history.viewCodeChanges")}</span>
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
            {t("cloud.history.noPathChanges")}
          </div>
        )}
      </section>

      {(commit.scope_path || commit.root_hash) && (
        <dl className="desktop-cloud-commit-technical-meta">
          {commit.scope_path && (
            <>
              <dt>{t("cloud.common.scope")}</dt>
              <dd><code>{commit.scope_path}</code></dd>
            </>
          )}
          {commit.root_hash && (
            <>
              <dt>{t("cloud.history.snapshot")}</dt>
              <dd><code title={commit.root_hash}>{shortCommit(commit.root_hash)}</code></dd>
            </>
          )}
        </dl>
      )}
    </article>
  );
}

function CloudCommitFileRow({ change }: { change: DesktopCloudHistoryChange }) {
  const { t } = useLocalization();
  const kind = getCloudHistoryChangeKind(change);
  const config = {
    added: { label: t("cloud.status.added"), shortLabel: "A", icon: FilePlus2 },
    modified: { label: t("cloud.status.modified"), shortLabel: "M", icon: FilePenLine },
    deleted: { label: t("cloud.status.deleted"), shortLabel: "D", icon: FileMinus2 },
  }[kind];
  const Icon = config.icon;

  return (
    <div className="desktop-cloud-commit-file-row" data-change-kind={kind}>
      <Icon size={14} aria-hidden="true" />
      <span title={change.path} dir="auto">{change.path}</span>
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
  const { t } = useLocalization();
  const count = changes.filter((change) => getCloudHistoryChangeKind(change) === kind).length;
  if (count === 0) return null;
  return <span className={kind}>{t(`cloud.history.changeKind.${kind}`, { count })}</span>;
}

function getCloudHistoryChangeKind(change: DesktopCloudHistoryChange): "added" | "modified" | "deleted" {
  if (change.action === "add" || change.op === "added") return "added";
  if (change.action === "delete" || change.op === "deleted") return "deleted";
  return "modified";
}
