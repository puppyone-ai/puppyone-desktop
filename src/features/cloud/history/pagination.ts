import type { DesktopCloudHistory } from "../../../lib/cloudHistoryApi";

export function mergeCloudHistoryPages(
  current: DesktopCloudHistory,
  nextPage: DesktopCloudHistory,
): DesktopCloudHistory {
  if (current.project_id !== nextPage.project_id) {
    throw new CloudHistorySnapshotChangedError("Cloud history page belongs to another project.");
  }
  if (current.snapshot_id !== nextPage.snapshot_id) {
    throw new CloudHistorySnapshotChangedError("Cloud history changed while loading more.");
  }
  if (
    !current.topology_available
    || !nextPage.topology_available
    || current.head_commit_id !== nextPage.head_commit_id
    || current.total !== nextPage.total
  ) {
    throw new CloudHistorySnapshotChangedError("Cloud history page metadata is inconsistent.");
  }

  const commitsById = new Map(current.commits.map((commit) => [commit.commit_id, commit]));
  for (const commit of nextPage.commits) {
    const existing = commitsById.get(commit.commit_id);
    if (existing && existing.parent_ids.join("\n") !== commit.parent_ids.join("\n")) {
      throw new CloudHistorySnapshotChangedError("Cloud history ancestry changed between pages.");
    }
    if (!existing) commitsById.set(commit.commit_id, commit);
  }
  const commits = [...commitsById.values()];
  const madeProgress = commits.length > current.commits.length;
  if (!madeProgress && nextPage.has_more) {
    throw new CloudHistorySnapshotChangedError("Cloud history pagination stopped making progress.");
  }
  const unreadableCommitIds = [...new Set([
    ...current.unreadable_commit_ids,
    ...nextPage.unreadable_commit_ids,
  ])];

  return {
    ...nextPage,
    project_id: current.project_id,
    commits,
    topology_available: true,
    head_commit_id: current.head_commit_id,
    refs: current.refs,
    refs_included: current.refs_included,
    snapshot_id: current.snapshot_id,
    total: current.total,
    next_cursor: madeProgress ? nextPage.next_cursor : null,
    has_more: madeProgress && nextPage.has_more,
    graph_health: current.graph_health === "degraded" || nextPage.graph_health === "degraded"
      ? "degraded"
      : "complete",
    unreadable_commit_ids: unreadableCommitIds,
  };
}

export class CloudHistorySnapshotChangedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudHistorySnapshotChangedError";
  }
}

export function isHistorySnapshotRestartError(error: unknown): boolean {
  return error instanceof CloudHistorySnapshotChangedError
    || (error instanceof Error && (error as Error & { status?: number }).status === 409);
}
