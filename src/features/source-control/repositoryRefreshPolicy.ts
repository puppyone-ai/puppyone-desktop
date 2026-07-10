import type { GitStatusSnapshot } from "../../types/electron";
import {
  createGitRefreshReason,
  type GitRefreshCause,
  type GitRefreshReason,
  type GitRefreshSource,
} from "./gitRefreshScheduler";

export function mergePreservedHistory(
  previous: GitStatusSnapshot | null,
  next: GitStatusSnapshot,
  options: { invalidateHistory?: boolean } = {},
): GitStatusSnapshot {
  if (options.invalidateHistory) {
    return { ...next, commits: [], allCommits: [] };
  }
  if (
    previous
    && previous.isRepo
    && next.isRepo
    && previous.headCommitId === next.headCommitId
    && previous.branch === next.branch
    && (previous.commits.length > 0 || previous.allCommits.length > 0)
  ) {
    return {
      ...next,
      commits: previous.commits,
      allCommits: previous.allCommits,
    };
  }
  return next;
}

export function shouldInvalidateHistoryForReason(
  reason: GitRefreshReason | null | undefined,
): boolean {
  return reason?.cause === "refs" || reason?.cause === "repository";
}

export function createRepositoryRefreshReason(
  detail: string,
  source: GitRefreshSource = "external",
): GitRefreshReason {
  let cause: GitRefreshCause;
  if (detail === "working-tree" || detail === "discard") {
    cause = "working-tree";
  } else if (detail === "index" || detail === "stage" || detail === "unstage") {
    cause = "index";
  } else if (
    detail === "ref"
    || detail === "fetch"
    || detail === "commit"
    || detail === "checkout"
    || detail === "pull"
    || detail === "push"
    || detail === "publish"
    || detail === "stash-checkout"
    || detail === "commit-checkout"
  ) {
    cause = "refs";
  } else if (detail === "configuration") {
    cause = "ui-configuration";
  } else {
    cause = "repository";
  }
  return createGitRefreshReason(cause, source, detail);
}
