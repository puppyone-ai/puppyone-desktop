import {
  ExternalLink,
  FileMinus2,
  FilePenLine,
  FilePlus2,
  GitCommitHorizontal,
} from "lucide-react";
import { openCloudApp } from "../../../lib/cloudApi";
import type {
  DesktopCloudHistoryChange,
  DesktopCloudHistoryCommit,
} from "../../../lib/cloudHistoryApi";
import type { CloudBranchGraphRow } from "../graph/model";
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
  const changes = commit.changes;
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
              <ExternalLink size={13} aria-hidden="true" />
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

function getCloudHistoryChangeKind(change: DesktopCloudHistoryChange): "added" | "modified" | "deleted" {
  if (change.action === "add" || change.op === "added") return "added";
  if (change.action === "delete" || change.op === "deleted") return "deleted";
  return "modified";
}

function formatExactTime(value: string | null): string {
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
